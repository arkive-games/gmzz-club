package server

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

//go:embed schema.sql catalog.json
var resources embed.FS

type App struct {
	db            *pgxpool.Pool
	secure        bool
	wechatAppID   string
	wechatSecret  string
	wechatAuthURL string
	limits        sync.Map
}
type apiError struct {
	Status  int
	Message string
}

func (e *apiError) Error() string       { return e.Message }
func fail(status int, msg string) error { return &apiError{status, msg} }

type endpoint func(http.ResponseWriter, *http.Request, pgx.Tx, string) (any, error)

func New(ctx context.Context, databaseURL string, secure bool) (*App, error) {
	if databaseURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	app := &App{
		db:            db,
		secure:        secure,
		wechatAppID:   strings.TrimSpace(os.Getenv("WECHAT_APPID")),
		wechatSecret:  strings.TrimSpace(os.Getenv("WECHAT_APP_SECRET")),
		wechatAuthURL: strings.TrimSpace(os.Getenv("WECHAT_AUTH_URL")),
	}
	if app.wechatAuthURL == "" {
		app.wechatAuthURL = "https://api.weixin.qq.com/sns/jscode2session"
	}
	tx, err := db.Begin(ctx)
	if err != nil {
		db.Close()
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(941885)"); err == nil {
		schema, _ := resources.ReadFile("schema.sql")
		_, err = tx.Exec(ctx, string(schema))
	}
	if err == nil {
		err = tx.Commit(ctx)
	}
	if err != nil {
		db.Close()
		return nil, err
	}
	return app, nil
}
func (a *App) Close() { a.db.Close() }
func (a *App) Promote(ctx context.Context, username string) error {
	result, err := a.db.Exec(ctx, "UPDATE users SET is_admin=true WHERE username=$1", strings.ToLower(username))
	if err == nil && result.RowsAffected() != 1 {
		return errors.New("User not found; register the account first")
	}
	return err
}
func uid() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}
func token() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func hashed(s string) string { sum := sha256.Sum256([]byte(s)); return hex.EncodeToString(sum[:]) }
func decode(r *http.Request, out any) error {
	d := json.NewDecoder(io.LimitReader(r.Body, 131073))
	d.DisallowUnknownFields()
	if err := d.Decode(out); err != nil {
		return fail(400, "请求数据无效")
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return fail(400, "请求数据无效")
	}
	return nil
}
func write(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func report(w http.ResponseWriter, err error) {
	var ae *apiError
	var pe *pgconn.PgError
	if errors.As(err, &ae) {
		write(w, ae.Status, map[string]string{"error": ae.Message})
		return
	}
	if errors.Is(err, pgx.ErrNoRows) {
		write(w, 404, map[string]string{"error": "记录不存在或无权访问"})
		return
	}
	if errors.As(err, &pe) {
		if pe.Code == "23505" {
			write(w, 409, map[string]string{"error": "记录已存在，请刷新后重试"})
			return
		}
		if pe.Code == "22P02" || pe.Code == "23503" || pe.Code == "23514" {
			write(w, 400, map[string]string{"error": "数据无效或关联记录已变更，请刷新后重试"})
			return
		}
	}
	log.Printf("API error: %v", err)
	write(w, 500, map[string]string{"error": "服务暂时不可用"})
}
func (a *App) wrap(fn endpoint, public bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
		defer cancel()
		r = r.WithContext(ctx)
		if r.Method != "GET" {
			if origin := r.Header.Get("Origin"); origin != "" {
				u, err := url.Parse(origin)
				if err != nil || u.Host != r.Host {
					report(w, fail(403, "请求来源无效"))
					return
				}
			}
			if r.Header.Get("Sec-Fetch-Site") == "cross-site" {
				report(w, fail(403, "请求来源无效"))
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, 131072)
		}
		tx, err := a.db.Begin(ctx)
		if err != nil {
			report(w, err)
			return
		}
		defer tx.Rollback(ctx)
		if r.Method != "GET" {
			if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(941886)"); err != nil {
				report(w, err)
				return
			}
		}
		user := ""
		if c, e := r.Cookie("club_session"); e == nil {
			_ = tx.QueryRow(ctx, "SELECT user_id::text FROM sessions WHERE token_hash=$1 AND expires_at>clock_timestamp()", hashed(c.Value)).Scan(&user)
		}
		if user == "" && !public {
			report(w, fail(401, "请先登录"))
			return
		}
		result, err := fn(w, r, tx, user)
		if err != nil {
			report(w, err)
			return
		}
		if err = tx.Commit(ctx); err != nil {
			report(w, err)
			return
		}
		write(w, 200, result)
	}
}
func (a *App) Handler() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := a.db.Ping(ctx); err != nil {
			report(w, err)
			return
		}
		write(w, 200, map[string]bool{"ok": true})
	})
	m.HandleFunc("GET /api/catalog", func(w http.ResponseWriter, r *http.Request) {
		data, _ := resources.ReadFile("catalog.json")
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "public, max-age=3600")
		_, _ = w.Write(data)
	})
	m.HandleFunc("POST /api/auth/register", a.wrap(a.register, true))
	m.HandleFunc("POST /api/auth/login", a.wrap(a.login, true))
	m.HandleFunc("POST /api/auth/wechat", a.wrap(a.wechatLogin, true))
	m.HandleFunc("POST /api/auth/logout", a.wrap(a.logout, false))
	m.HandleFunc("GET /api/state", a.wrap(a.state, false))
	m.HandleFunc("GET /api/users", a.wrap(a.users, false))
	m.HandleFunc("POST /api/characters", a.wrap(a.saveCharacter, false))
	m.HandleFunc("PUT /api/characters/{character}", a.wrap(a.saveCharacter, false))
	m.HandleFunc("DELETE /api/characters/{character}", a.wrap(a.deleteCharacter, false))
	m.HandleFunc("POST /api/clubs", a.wrap(a.createClub, false))
	m.HandleFunc("GET /api/clubs/{club}", a.wrap(a.clubDetail, false))
	m.HandleFunc("POST /api/clubs/{club}/applications", a.wrap(a.apply, false))
	m.HandleFunc("PUT /api/clubs/{club}/applications/{user}", a.wrap(a.reviewApplication, false))
	m.HandleFunc("PUT /api/clubs/{club}/members/{user}", a.wrap(a.changeRole, false))
	m.HandleFunc("DELETE /api/clubs/{club}/members/{user}", a.wrap(a.removeMember, false))
	m.HandleFunc("PUT /api/clubs/{club}/characters/{character}", a.wrap(a.bindCharacter, false))
	m.HandleFunc("POST /api/clubs/{club}/events", a.wrap(a.createEvent, false))
	m.HandleFunc("PUT /api/events/{event}", a.wrap(a.updateEvent, false))
	m.HandleFunc("PUT /api/events/{event}/signups/{character}", a.wrap(a.signup, false))
	m.HandleFunc("DELETE /api/events/{event}/signups/{character}", a.wrap(a.signup, false))
	m.HandleFunc("PUT /api/events/{event}/lineup", a.wrap(a.saveLineup, false))
	m.HandleFunc("POST /api/events/{event}/teams", a.wrap(a.changeTeams, false))
	m.HandleFunc("DELETE /api/events/{event}/teams/{team}", a.wrap(a.changeTeams, false))
	m.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		write(w, 404, map[string]string{"error": "接口不存在"})
	})
	m.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		write(w, 404, map[string]string{"error": "API endpoint only"})
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
		}
		m.ServeHTTP(w, r)
	})
}

type credentials struct {
	Username    string `json:"username"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
}
type wechatCredentials struct {
	Code        string `json:"code"`
	DisplayName string `json:"displayName"`
}
type wechatSession struct {
	OpenID  string `json:"openid"`
	ErrCode int    `json:"errcode"`
	ErrMsg  string `json:"errmsg"`
}
type loginWindow struct {
	count int
	until time.Time
}

func (a *App) authLimit(r *http.Request) error {
	// A global window bounds expensive password work without trusting proxy headers.
	value, _ := a.limits.LoadOrStore("auth", &loginWindow{until: time.Now().Add(time.Minute)})
	v := value.(*loginWindow)
	if time.Now().After(v.until) {
		v.count = 0
		v.until = time.Now().Add(time.Minute)
	}
	v.count++
	if v.count > 60 {
		return fail(429, "请求过于频繁，请稍后重试")
	}
	return nil
}
func (a *App) register(w http.ResponseWriter, r *http.Request, tx pgx.Tx, _ string) (any, error) {
	if err := a.authLimit(r); err != nil {
		return nil, err
	}
	var c credentials
	if err := decode(r, &c); err != nil {
		return nil, err
	}
	c.Username = strings.ToLower(strings.TrimSpace(c.Username))
	c.DisplayName = strings.TrimSpace(c.DisplayName)
	if len(c.Username) < 3 || len(c.Username) > 40 || strings.ContainsAny(c.Username, " \t\n\r@/") {
		return nil, fail(400, "用户名须为 3–40 位，不含空白、@ 或斜线")
	}
	if len(c.Password) < 10 || len(c.Password) > 72 {
		return nil, fail(400, "密码须为 10–72 字节")
	}
	if c.DisplayName == "" || len([]rune(c.DisplayName)) > 40 {
		return nil, fail(400, "昵称须为 1–40 字")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(c.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	id := uid()
	_, err = tx.Exec(r.Context(), "INSERT INTO users(id,username,display_name,password_hash) VALUES($1,$2,$3,$4)", id, c.Username, c.DisplayName, string(hash))
	if err != nil {
		return nil, err
	}
	return a.newSession(w, r, tx, id)
}
func (a *App) login(w http.ResponseWriter, r *http.Request, tx pgx.Tx, _ string) (any, error) {
	if err := a.authLimit(r); err != nil {
		return nil, err
	}
	var c credentials
	if err := decode(r, &c); err != nil {
		return nil, err
	}
	var id, hash string
	err := tx.QueryRow(r.Context(), "SELECT id::text,password_hash FROM users WHERE username=$1", strings.ToLower(strings.TrimSpace(c.Username))).Scan(&id, &hash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(c.Password)) != nil {
		return nil, fail(401, "用户名或密码错误")
	}
	return a.newSession(w, r, tx, id)
}
func (a *App) wechatLogin(w http.ResponseWriter, r *http.Request, tx pgx.Tx, _ string) (any, error) {
	if err := a.authLimit(r); err != nil {
		return nil, err
	}
	if a.wechatAppID == "" || a.wechatSecret == "" {
		return nil, fail(503, "微信登录尚未配置，请联系管理员")
	}
	var c wechatCredentials
	if err := decode(r, &c); err != nil {
		return nil, err
	}
	c.Code = strings.TrimSpace(c.Code)
	if c.Code == "" {
		return nil, fail(400, "微信授权码不能为空")
	}
	params := url.Values{
		"appid":      {a.wechatAppID},
		"secret":     {a.wechatSecret},
		"js_code":    {c.Code},
		"grant_type": {"authorization_code"},
	}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, a.wechatAuthURL+"?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fail(502, "微信授权服务暂时不可用")
	}
	defer resp.Body.Close()
	var session wechatSession
	if err := json.NewDecoder(io.LimitReader(resp.Body, 64*1024)).Decode(&session); err != nil {
		return nil, fail(502, "微信授权响应无效")
	}
	if resp.StatusCode != http.StatusOK || session.ErrCode != 0 || session.OpenID == "" {
		return nil, fail(401, "微信授权失败，请重试")
	}
	var id string
	err = tx.QueryRow(r.Context(), "SELECT id::text FROM users WHERE wechat_openid=$1", session.OpenID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		id = uid()
		name := strings.TrimSpace(c.DisplayName)
		if name == "" {
			name = "微信用户"
		}
		if len([]rune(name)) > 40 {
			name = string([]rune(name)[:40])
		}
		username := "wx_" + session.OpenID
		if len(username) > 40 || strings.ContainsAny(username, " \t\n\r@/") {
			username = "wx_" + hashed(session.OpenID)[:32]
		}
		passwordHash, hashErr := bcrypt.GenerateFromPassword([]byte(token()), bcrypt.DefaultCost)
		if hashErr != nil {
			return nil, hashErr
		}
		_, err = tx.Exec(r.Context(), "INSERT INTO users(id,username,display_name,password_hash,wechat_openid) VALUES($1,$2,$3,$4,$5)", id, username, name, string(passwordHash), session.OpenID)
	}
	if err != nil {
		return nil, err
	}
	return a.newSession(w, r, tx, id)
}
func (a *App) newSession(w http.ResponseWriter, r *http.Request, tx pgx.Tx, id string) (any, error) {
	secret := token()
	_, err := tx.Exec(r.Context(), "DELETE FROM sessions WHERE expires_at<clock_timestamp()")
	if err != nil {
		return nil, err
	}
	_, err = tx.Exec(r.Context(), "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '7 days')", hashed(secret), id)
	if err == nil {
		http.SetCookie(w, &http.Cookie{Name: "club_session", Value: secret, Path: "/", HttpOnly: true, Secure: a.secure, SameSite: http.SameSiteLaxMode, MaxAge: 604800})
	}
	return map[string]string{"id": id}, err
}
func (a *App) logout(w http.ResponseWriter, r *http.Request, tx pgx.Tx, _ string) (any, error) {
	c, _ := r.Cookie("club_session")
	_, err := tx.Exec(r.Context(), "DELETE FROM sessions WHERE token_hash=$1", hashed(c.Value))
	http.SetCookie(w, &http.Cookie{Name: "club_session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: a.secure, SameSite: http.SameSiteLaxMode})
	return map[string]bool{"ok": true}, err
}
func jsonRows(ctx context.Context, tx pgx.Tx, query string, args ...any) (json.RawMessage, error) {
	var data []byte
	err := tx.QueryRow(ctx, "SELECT coalesce(json_agg(q),'[]'::json) FROM ("+query+") q", args...).Scan(&data)
	return data, err
}
func role(ctx context.Context, tx pgx.Tx, club, user string) (string, error) {
	var result string
	err := tx.QueryRow(ctx, "SELECT role FROM memberships WHERE club_id=$1 AND user_id=$2", club, user).Scan(&result)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", fail(403, "你不是该俱乐部成员")
	}
	return result, err
}
func manager(ctx context.Context, tx pgx.Tx, club, user string) error {
	v, err := role(ctx, tx, club, user)
	if err != nil {
		return err
	}
	if v == "member" {
		return fail(403, "需要俱乐部管理员权限")
	}
	return nil
}
func platformAdmin(ctx context.Context, tx pgx.Tx, user string) error {
	var ok bool
	err := tx.QueryRow(ctx, "SELECT is_admin FROM users WHERE id=$1", user).Scan(&ok)
	if err != nil {
		return err
	}
	if !ok {
		return fail(403, "需要平台管理员权限")
	}
	return nil
}
func (a *App) state(_ http.ResponseWriter, r *http.Request, tx pgx.Tx, user string) (any, error) {
	ctx := r.Context()
	out := map[string]any{}
	var me []byte
	if err := tx.QueryRow(ctx, "SELECT json_build_object('id',id,'username',username,'display_name',display_name,'wechat_openid',wechat_openid,'is_admin',is_admin) FROM users WHERE id=$1", user).Scan(&me); err != nil {
		return nil, err
	}
	out["me"] = json.RawMessage(me)
	chars, err := jsonRows(ctx, tx, "SELECT id,user_id,club_id,name,profession_id,score,profile FROM characters WHERE user_id=$1 ORDER BY created_at", user)
	if err != nil {
		return nil, err
	}
	out["characters"] = chars
	clubs, err := jsonRows(ctx, tx, `SELECT c.*,m.role,(SELECT count(*) FROM memberships x WHERE x.club_id=c.id) member_count,
 (SELECT status FROM applications ap WHERE ap.club_id=c.id AND ap.user_id=$1) application_status
 FROM clubs c LEFT JOIN memberships m ON m.club_id=c.id AND m.user_id=$1 ORDER BY c.created_at`, user)
	if err != nil {
		return nil, err
	}
	out["clubs"] = clubs
	var now time.Time
	if err = tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); err != nil {
		return nil, err
	}
	out["now"] = now
	return out, nil
}
func (a *App) users(_ http.ResponseWriter, r *http.Request, tx pgx.Tx, user string) (any, error) {
	if err := platformAdmin(r.Context(), tx, user); err != nil {
		return nil, err
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) < 2 {
		return []any{}, nil
	}
	return jsonRows(r.Context(), tx, "SELECT id,username,display_name FROM users WHERE username ILIKE $1 OR display_name ILIKE $1 ORDER BY username LIMIT 20", "%"+q+"%")
}
func (a *App) clubDetail(_ http.ResponseWriter, r *http.Request, tx pgx.Tx, user string) (any, error) {
	ctx := r.Context()
	club := r.PathValue("club")
	v, err := role(ctx, tx, club, user)
	if err != nil {
		return nil, err
	}
	out := map[string]any{"role": v}
	queries := map[string]string{
		"members":    "SELECT u.id,u.username,u.display_name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.club_id=$1 ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,u.display_name",
		"characters": "SELECT c.id,c.user_id,c.club_id,c.name,c.profession_id,c.score,c.profile,u.display_name FROM characters c JOIN users u ON u.id=c.user_id WHERE c.club_id=$1 ORDER BY c.score DESC,c.name",
		"events":     "SELECT e.* FROM events e WHERE club_id=$1 ORDER BY starts_at DESC",
		"signups":    "SELECT s.* FROM signups s JOIN events e ON e.id=s.event_id WHERE e.club_id=$1",
		"slots":      "SELECT s.* FROM slots s JOIN events e ON e.id=s.event_id WHERE e.club_id=$1 ORDER BY s.team,s.position",
	}
	if v != "member" {
		queries["applications"] = "SELECT ap.user_id,ap.created_at,u.username,u.display_name FROM applications ap JOIN users u ON u.id=ap.user_id WHERE ap.club_id=$1 AND ap.status='pending' ORDER BY ap.created_at"
	}
	for key, q := range queries {
		data, e := jsonRows(ctx, tx, q, club)
		if e != nil {
			return nil, e
		}
		out[key] = data
	}
	return out, nil
}
