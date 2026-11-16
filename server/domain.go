package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type Named struct {
	ID           int    `json:"id"`
	Name         string `json:"name"`
	ProfessionID int    `json:"professionId"`
}
type Catalog struct {
	Professions []Named `json:"professions"`
	Talents     []Named `json:"talents"`
	Relics      []Named `json:"relics"`
	Puppets     []Named `json:"puppets"`
	Fellows     []Named `json:"fellows"`
}

var catalog Catalog

func init() {
	b, _ := resources.ReadFile("catalog.json")
	if err := json.Unmarshal(b, &catalog); err != nil {
		panic(err)
	}
}
func known(list []Named, id int) bool {
	for _, x := range list {
		if x.ID == id {
			return true
		}
	}
	return false
}

type Level struct {
	ID    int `json:"id"`
	Level int `json:"level"`
}
type Loadout struct {
	TalentID int     `json:"talentId"`
	Healing  string  `json:"healing"`
	Relics   []Level `json:"relics"`
	Puppet   *Level  `json:"puppet"`
	Fellow   *Level  `json:"fellow"`
}
type Profile struct {
	Relics  []Level `json:"relics"`
	Puppets []Level `json:"puppets"`
	Fellows []Level `json:"fellows"`
	Default Loadout `json:"default"`
}
type Character struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	ProfessionID int     `json:"professionId"`
	Score        int     `json:"score"`
	Profile      Profile `json:"profile"`
}

func validateLevels(levels []Level, list []Named, min, max int) error {
	if len(levels) > len(list) {
		return fail(400, "配置项目过多")
	}
	seen := map[int]bool{}
	for _, l := range levels {
		if !known(list, l.ID) || seen[l.ID] || l.Level < min || l.Level > max {
			return fail(400, "等级无效或项目重复")
		}
		seen[l.ID] = true
	}
	return nil
}
func validateLoadout(load Loadout, profession int) error {
	valid := false
	for _, t := range catalog.Talents {
		if t.ID == load.TalentID && t.ProfessionID == profession {
			valid = true
		}
	}
	if !valid {
		return fail(400, "天赋与途径不匹配")
	}
	if load.Healing != "" && load.Healing != "yuxin" && load.Healing != "other" {
		return fail(400, "治疗分类无效")
	}
	if load.TalentID == 201 && load.Healing == "" {
		return fail(400, "请设置观众治疗分类")
	}
	if load.TalentID != 201 && load.Healing != "" {
		return fail(400, "只有治疗观众需要治疗分类")
	}
	if len(load.Relics) > 3 {
		return fail(400, "最多携带 3 个封印物")
	}
	if err := validateLevels(load.Relics, catalog.Relics, 0, 3); err != nil {
		return err
	}
	if load.Puppet != nil {
		if err := validateLevels([]Level{*load.Puppet}, catalog.Puppets, 1, 100); err != nil {
			return err
		}
	}
	if load.Fellow != nil {
		if err := validateLevels([]Level{*load.Fellow}, catalog.Fellows, 1, 100); err != nil {
			return err
		}
	}
	return nil
}
func validateCharacter(c Character) error {
	if strings.TrimSpace(c.Name) == "" || len([]rune(c.Name)) > 40 {
		return fail(400, "角色名须为 1–40 字")
	}
	if !known(catalog.Professions, c.ProfessionID) || c.Score < 0 || c.Score > 2147483647 {
		return fail(400, "途径或非凡评分无效")
	}
	if err := validateLevels(c.Profile.Relics, catalog.Relics, 0, 3); err != nil {
		return err
	}
	if err := validateLevels(c.Profile.Puppets, catalog.Puppets, 1, 100); err != nil {
		return err
	}
	if err := validateLevels(c.Profile.Fellows, catalog.Fellows, 1, 100); err != nil {
		return err
	}
	if err := validateLoadout(c.Profile.Default, c.ProfessionID); err != nil {
		return err
	}
	available := func(chosen *Level, list []Level) bool {
		if chosen == nil {
			return true
		}
		for _, x := range list {
			if x == *chosen {
				return true
			}
		}
		return false
	}
	if !available(c.Profile.Default.Puppet, c.Profile.Puppets) || !available(c.Profile.Default.Fellow, c.Profile.Fellows) {
		return fail(400, "默认技能须从已设置技能中选择")
	}
	for _, relic := range c.Profile.Default.Relics {
		if !available(&relic, c.Profile.Relics) {
			return fail(400, "默认封印物须从角色档案中选择")
		}
	}
	return nil
}
func (a *App) saveCharacter(_ http.ResponseWriter, r *http.Request, tx pgx.Tx, user string) (any, error) {
	var c Character
	if err := decode(r, &c); err != nil {
		return nil, err
	}
	c.Name = strings.TrimSpace(c.Name)
	if c.Profile.Relics == nil {
		c.Profile.Relics = []Level{}
	}
	if c.Profile.Puppets == nil {
		c.Profile.Puppets = []Level{}
	}
	if c.Profile.Fellows == nil {
		c.Profile.Fellows = []Level{}
	}
	if c.Profile.Default.Relics == nil {
		c.Profile.Default.Relics = []Level{}
	}
	if err := validateCharacter(c); err != nil {
		return nil, err
	}
	profile, _ := json.Marshal(c.Profile)
	id := r.PathValue("character")
	var err error
	if id == "" {
		id = uid()
		_, err = tx.Exec(r.Context(), "INSERT INTO characters(id,user_id,name,profession_id,score,profile) VALUES($1,$2,$3,$4,$5,$6)", id, user, c.Name, c.ProfessionID, c.Score, profile)
	} else {
		result, e := tx.Exec(r.Context(), "UPDATE characters SET name=$3,profession_id=$4,score=$5,profile=$6 WHERE id=$1 AND user_id=$2", id, user, c.Name, c.ProfessionID, c.Score, profile)
		err = e
		if err == nil && result.RowsAffected() != 1 {
			return nil, fail(404, "角色不存在")
		}
	}
	return map[string]string{"id": id}, err
}
func (a *App) deleteCharacter(_ http.ResponseWriter, r *http.Request, tx pgx.Tx, user string) (any, error) {
	// Deleting a character must not bypass the signup cancellation deadline.
	id := r.PathValue("character")
	var owned bool
	if err := tx.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM characters WHERE id=$1 AND user_id=$2)", id, user).Scan(&owned); err != nil {
		return nil, err
	}
	if !owned {
		return nil, fail(404, "角色不存在")
	}
	var locked bool
	err := tx.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM signups s JOIN events e ON e.id=s.event_id WHERE s.character_id=$1 AND clock_timestamp()>=e.deadline AND e.starts_at>clock_timestamp())", id).Scan(&locked)
	if err != nil {
		return nil, err
	}
	if locked {
		return nil, fail(409, "角色已报名尚未开始且已截止的活动，暂不可删除")
	}
	if err := cleanupCharacter(r, tx, "id=$1", id); err != nil {
		return nil, err
	}
	result, err := tx.Exec(r.Context(), "DELETE FROM characters WHERE id=$1 AND user_id=$2", id, user)
	if err == nil && result.RowsAffected() != 1 {
		return nil, fail(404, "角色不存在")
	}
	return map[string]bool{"ok": true}, err
}
func (a *App) createClub(_ http.ResponseWriter, r *http.Request, tx pgx.Tx, user string) (any, error) {
	ctx := r.Context()
	if err := platformAdmin(ctx, tx, user); err != nil {
		return nil, err
	}
	var input struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		OwnerID     string `json:"ownerId"`
	}
	if err := decode(r, &input); err != nil {
		return nil, err
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || len([]rune(input.Name)) > 60 || len([]rune(input.Description)) > 1000 {
		return nil, fail(400, "俱乐部名称或简介长度无效")
	}
	if input.OwnerID == user {
		return nil, fail(400, "创建者不自动加入；请指定其他用户为首位会长")
	}
	id := uid()
	if _, err := tx.Exec(ctx, "INSERT INTO clubs(id,name,description) VALUES($1,$2,$3)", id, input.Name, input.Description); err != nil {
		return nil, err
	}
	_, err := tx.Exec(ctx, "INSERT INTO memberships(club_id,user_id,role) VALUES($1,$2,'owner')", id, input.OwnerID)
	return map[string]string{"id": id}, err
}
func (a *App) apply(_ http.ResponseWriter, r *http.Request, tx pgx.Tx, user string) (any, error) {
	club := r.PathValue("club")
	var exists bool
	if err := tx.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM memberships WHERE club_id=$1 AND user_id=$2)", club, user).Scan(&exists); err != nil {
		return nil, err
	}
	if exists {
		return nil, fail(409, "你已是成员")
	}
	result, err := tx.Exec(r.Context(), "INSERT INTO applications(club_id,user_id) VALUES($1,$2) ON CONFLICT(club_id,user_id) DO UPDATE SET status='pending',created_at=clock_timestamp() WHERE applications.status<>'pending'", club, user)
	if err == nil && result.RowsAffected() == 0 {
		return nil, fail(409, "申请正在审核中")
	}
	return map[string]bool{"ok": true}, err
}
func (a *App) reviewApplication(_ http.ResponseWriter, r *http.Request, tx pgx.Tx, user string) (any, error) {
	ctx := r.Context()
	club, target := r.PathValue("club"), r.PathValue("user")
	if err := manager(ctx, tx, club, user); err != nil {
		return nil, err
	}
	var input struct {
		Accept bool `json:"accept"`
	}
	if err := decode(r, &input); err != nil {
		return nil, err
	}
	status := "rejected"
	if input.Accept {
		status = "accepted"
	}
	result, err := tx.Exec(ctx, "UPDATE applications SET status=$3 WHERE club_id=$1 AND user_id=$2 AND status='pending'", club, target, status)
	if err != nil {
		return nil, err
	}
	if result.RowsAffected() != 1 {
		return nil, fail(409, "申请已处理或不存在")
	}
	if input.Accept {
		_, err = tx.Exec(ctx, "INSERT INTO memberships VALUES($1,$2,'member')", club, target)
	}
	return map[string]bool{"ok": true}, err
}
func (a *App) changeRole(_ http.ResponseWriter, r *http.Request, tx pgx.Tx, user string) (any, error) {
	ctx := r.Context()
	club, target := r.PathValue("club"), r.PathValue("user")
	actor, err := role(ctx, tx, club, user)
	if err != nil {
		return nil, err
	}
	if actor != "owner" {
		return nil, fail(403, "只有会长可以变更成员权限")
	}
	var input struct {
		Role string `json:"role"`
	}
	if err = decode(r, &input); err != nil {
		return nil, err
	}
	if input.Role != "owner" && input.Role != "admin" && input.Role != "member" {
		return nil, fail(400, "权限无效")
	}
	old, err := role(ctx, tx, club, target)
	if err != nil {
		return nil, err
	}
	if old == "owner" && input.Role != "owner" {
		var owners int
		if err = tx.QueryRow(ctx, "SELECT count(*) FROM memberships WHERE club_id=$1 AND role='owner'", club).Scan(&owners); err != nil {
			return nil, err
		}
		if owners <= 1 {
			return nil, fail(409, "请先指定另一位会长")
		}
	}
	_, err = tx.Exec(ctx, "UPDATE memberships SET role=$3 WHERE club_id=$1 AND user_id=$2", club, target, input.Role)
	return map[string]bool{"ok": true}, err
}
func cleanupCharacter(ctxReq *http.Request, tx pgx.Tx, condition string, args ...any) error {
	ctx := ctxReq.Context()
	for _, table := range []string{"signups", "slots"} {
		if _, err := tx.Exec(ctx, "DELETE FROM "+table+" WHERE character_id IN (SELECT id FROM characters WHERE "+condition+")", args...); err != nil {
			return err
		}
	}
	// Any affected event editor must reload rather than restoring removed characters.
	_, err := tx.Exec(ctx, "UPDATE events SET revision=revision+1 WHERE club_id IN (SELECT DISTINCT club_id FROM characters WHERE "+condition+")", args...)
	return err
}
func (a *App) removeMember(_ http.ResponseWriter, r *http.Request, tx pgx.Tx, user string) (any, error) {
	ctx := r.Context()
	club, target := r.PathValue("club"), r.PathValue("user")
	actor, err := role(ctx, tx, club, user)
	if err != nil {
		return nil, err
	}
	victim, err := role(ctx, tx, club, target)
	if err != nil {
		return nil, err
	}
	if target != user && actor != "owner" && !(actor == "admin" && victim == "member") {
		return nil, fail(403, "无权移除此成员")
	}
	if target == user {
		if err = preventLockedRemoval(r, tx, "user_id=$1 AND club_id=$2", user, club); err != nil {
			return nil, err
		}
	}
	if victim == "owner" {
		var owners, total int
		if err = tx.QueryRow(ctx, "SELECT count(*) FILTER(WHERE role='owner'),count(*) FROM memberships WHERE club_id=$1", club).Scan(&owners, &total); err != nil {
			return nil, err
		}
		if owners == 1 {
			if total > 1 {
				return nil, fail(409, "最后一位会长须先转移会长权限")
			}
			_, err = tx.Exec(ctx, "DELETE FROM clubs WHERE id=$1", club)
			return map[string]bool{"dissolved": true}, err
		}
	}
	if err = cleanupCharacter(r, tx, "club_id=$1 AND user_id=$2", club, target); err != nil {
		return nil, err
	}
	_, err = tx.Exec(ctx, "DELETE FROM memberships WHERE club_id=$1 AND user_id=$2", club, target)
	return map[string]bool{"ok": true}, err
}
func (a *App) bindCharacter(_ http.ResponseWriter, r *http.Request, tx pgx.Tx, user string) (any, error) {
	ctx := r.Context()
	club, id := r.PathValue("club"), r.PathValue("character")
	actor, err := role(ctx, tx, club, user)
	if err != nil {
		return nil, err
	}
	var input struct {
		Bound bool `json:"bound"`
	}
	if err = decode(r, &input); err != nil {
		return nil, err
	}
	var owner string
	var current *string
	if err = tx.QueryRow(ctx, "SELECT user_id::text,club_id::text FROM characters WHERE id=$1", id).Scan(&owner, &current); err != nil {
		return nil, err
	}
	if input.Bound {
		if owner != user {
			return nil, fail(403, "只能绑定自己的角色")
		}
		if current != nil {
			return nil, fail(409, "角色已绑定俱乐部")
		}
		_, err = tx.Exec(ctx, "UPDATE characters SET club_id=$2 WHERE id=$1", id, club)
	} else {
		if current == nil || *current != club {
			return nil, fail(409, "角色不在该俱乐部")
		}
		if owner != user && actor == "member" {
			return nil, fail(403, "无权解除其他成员角色绑定")
		}
		if owner == user {
			if err = preventLockedRemoval(r, tx, "id=$1", id); err != nil {
				return nil, err
			}
		}
		if err = cleanupCharacter(r, tx, "id=$1", id); err != nil {
			return nil, err
		}
		_, err = tx.Exec(ctx, "UPDATE characters SET club_id=NULL WHERE id=$1", id)
	}
	return map[string]bool{"ok": true}, err
}

func preventLockedRemoval(r *http.Request, tx pgx.Tx, condition string, args ...any) error {
	var locked bool
	err := tx.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM signups s JOIN events e ON e.id=s.event_id WHERE s.character_id IN (SELECT id FROM characters WHERE "+condition+") AND clock_timestamp()>=e.deadline AND e.starts_at>clock_timestamp())", args...).Scan(&locked)
	if err != nil {
		return err
	}
	if locked {
		return fail(409, "存在已截止且尚未开始的活动报名，暂不可退出或解绑")
	}
	return nil
}

type EventInput struct {
	Title       string    `json:"title"`
	Description string    `json:"description"`
	StartsAt    time.Time `json:"startsAt"`
	Deadline    time.Time `json:"deadline"`
	TeamCount   int       `json:"teamCount"`
}

func validateEvent(input EventInput, now time.Time) error {
	if strings.TrimSpace(input.Title) == "" || len([]rune(input.Title)) > 100 || len([]rune(input.Description)) > 3000 {
		return fail(400, "活动标题或说明长度无效")
	}
	if input.Deadline.Before(now) || !input.StartsAt.After(now) || input.Deadline.After(input.StartsAt) {
		return fail(400, "报名截止时间须在未来且不晚于活动时间")
	}
	if input.TeamCount < 1 || input.TeamCount > 20 {
		return fail(400, "团队数量须为 1–20")
	}
	return nil
}
func (a *App) createEvent(_ http.ResponseWriter, r *http.Request, tx pgx.Tx, user string) (any, error) {
	ctx := r.Context()
	club := r.PathValue("club")
	if err := manager(ctx, tx, club, user); err != nil {
		return nil, err
	}
	input := EventInput{TeamCount: 3}
	if err := decode(r, &input); err != nil {
		return nil, err
	}
	var now time.Time
	if err := tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&now); err != nil {
		return nil, err
	}
	if err := validateEvent(input, now); err != nil {
		return nil, err
	}
	id := uid()
	_, err := tx.Exec(ctx, "INSERT INTO events(id,club_id,title,description,starts_at,deadline,team_count) VALUES($1,$2,$3,$4,$5,$6,$7)", id, club, strings.TrimSpace(input.Title), input.Description, input.StartsAt, input.Deadline, input.TeamCount)
	return map[string]string{"id": id}, err
}
func eventClub(r *http.Request, tx pgx.Tx) (string, error) {
	var club string
	err := tx.QueryRow(r.Context(), "SELECT club_id::text FROM events WHERE id=$1", r.PathValue("event")).Scan(&club)
	return club, err
}
func (a *App) updateEvent(_ http.ResponseWriter, r *http.Request, tx pgx.Tx, user string) (any, error) {
	ctx := r.Context()
	club, err := eventClub(r, tx)
	if err != nil {
		return nil, err
	}
	if err = manager(ctx, tx, club, user); err != nil {
		return nil, err
	}
	var input EventInput
	if err = decode(r, &input); err != nil {
		return nil, err
	}
	var now, oldDeadline time.Time
	var oldTeams int
	id := r.PathValue("event")
	if err = tx.QueryRow(ctx, "SELECT clock_timestamp(),deadline,team_count FROM events WHERE id=$1", id).Scan(&now, &oldDeadline, &oldTeams); err != nil {
		return nil, err
	}
	if !now.Before(oldDeadline) {
		return nil, fail(409, "报名已截止，活动时间及截止时间已锁定")
	}
	if err = validateEvent(input, now); err != nil {
		return nil, err
	}
	if input.TeamCount < oldTeams {
		var occupied bool
		if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM slots WHERE event_id=$1 AND team>$2)", id, input.TeamCount).Scan(&occupied); err != nil {
			return nil, err
		}
		if occupied {
			return nil, fail(409, "请先清空要移除的团队")
		}
	}
	_, err = tx.Exec(ctx, "UPDATE events SET title=$2,description=$3,starts_at=$4,deadline=$5,team_count=$6,revision=revision+1 WHERE id=$1", id, strings.TrimSpace(input.Title), input.Description, input.StartsAt, input.Deadline, input.TeamCount)
	return map[string]bool{"ok": true}, err
}
func (a *App) signup(_ http.ResponseWriter, r *http.Request, tx pgx.Tx, user string) (any, error) {
	ctx := r.Context()
	club, err := eventClub(r, tx)
	if err != nil {
		return nil, err
	}
	if _, err = role(ctx, tx, club, user); err != nil {
		return nil, err
	}
	var open, eligible bool
	event, id := r.PathValue("event"), r.PathValue("character")
	if err = tx.QueryRow(ctx, "SELECT clock_timestamp()<deadline FROM events WHERE id=$1", event).Scan(&open); err != nil {
		return nil, err
	}
	if !open {
		return nil, fail(409, "报名已截止，不能报名或取消报名")
	}
	if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM characters WHERE id=$1 AND user_id=$2 AND club_id=$3)", id, user, club).Scan(&eligible); err != nil {
		return nil, err
	}
	if !eligible {
		return nil, fail(403, "只能使用自己在该俱乐部的角色报名")
	}
	if r.Method == "DELETE" {
		_, err = tx.Exec(ctx, "DELETE FROM signups WHERE event_id=$1 AND character_id=$2", event, id)
	} else {
		_, err = tx.Exec(ctx, "INSERT INTO signups(event_id,character_id) VALUES($1,$2) ON CONFLICT DO NOTHING", event, id)
	}
	return map[string]bool{"ok": true}, err
}

type SlotConfig struct {
	Loadout
	Name         string `json:"name"`
	ProfessionID int    `json:"professionId"`
	Score        int    `json:"score"`
}

func (a *App) changeTeams(_ http.ResponseWriter, r *http.Request, tx pgx.Tx, user string) (any, error) {
	ctx := r.Context()
	club, err := eventClub(r, tx)
	if err != nil {
		return nil, err
	}
	if err = manager(ctx, tx, club, user); err != nil {
		return nil, err
	}
	var input struct {
		Revision *int `json:"revision"`
	}
	if err = decode(r, &input); err != nil {
		return nil, err
	}
	var count, revision int
	id := r.PathValue("event")
	if err = tx.QueryRow(ctx, "SELECT team_count,revision FROM events WHERE id=$1", id).Scan(&count, &revision); err != nil {
		return nil, err
	}
	if input.Revision == nil {
		return nil, fail(400, "请提供团队配置版本")
	}
	if *input.Revision != revision {
		return nil, fail(409, "团队配置已变更，请刷新后重试")
	}
	if r.Method == "POST" {
		if count >= 20 {
			return nil, fail(400, "最多支持 20 个团队")
		}
		count++
	} else {
		team, e := strconv.Atoi(r.PathValue("team"))
		if e != nil || team < 1 || team > count {
			return nil, fail(400, "团队不存在")
		}
		if count <= 1 {
			return nil, fail(409, "至少保留一个团队")
		}
		if _, err = tx.Exec(ctx, "DELETE FROM slots WHERE event_id=$1 AND team=$2", id, team); err != nil {
			return nil, err
		}
		// Shift ascending so each destination is empty under the unique slot index.
		for next := team + 1; next <= count; next++ {
			if _, err = tx.Exec(ctx, "UPDATE slots SET team=team-1 WHERE event_id=$1 AND team=$2", id, next); err != nil {
				return nil, err
			}
		}
		count--
	}
	_, err = tx.Exec(ctx, "UPDATE events SET team_count=$2,revision=revision+1 WHERE id=$1", id, count)
	return map[string]int{"teamCount": count, "revision": revision + 1}, err
}

type Slot struct {
	Team        int         `json:"team"`
	Position    int         `json:"position"`
	CharacterID string      `json:"character_id"`
	Config      *SlotConfig `json:"config"`
}

func (a *App) saveLineup(_ http.ResponseWriter, r *http.Request, tx pgx.Tx, user string) (any, error) {
	ctx := r.Context()
	club, err := eventClub(r, tx)
	if err != nil {
		return nil, err
	}
	if err = manager(ctx, tx, club, user); err != nil {
		return nil, err
	}
	var input struct {
		Revision int    `json:"revision"`
		Slots    []Slot `json:"slots"`
	}
	if err = decode(r, &input); err != nil {
		return nil, err
	}
	var teams, revision int
	id := r.PathValue("event")
	if err = tx.QueryRow(ctx, "SELECT team_count,revision FROM events WHERE id=$1", id).Scan(&teams, &revision); err != nil {
		return nil, err
	}
	if revision != input.Revision {
		return nil, fail(409, "团队配置已被其他管理员更新，请刷新后重试")
	}
	if len(input.Slots) > teams*30 {
		return nil, fail(400, "配置超出团队容量")
	}
	seenChars := map[string]bool{}
	seenPositions := map[string]bool{}
	for i := range input.Slots {
		s := &input.Slots[i]
		position := fmt.Sprintf("%d:%d", s.Team, s.Position)
		if s.Team < 1 || s.Team > teams || s.Position < 0 || s.Position > 29 || seenPositions[position] || seenChars[s.CharacterID] {
			return nil, fail(400, "位置无效或角色被重复编排")
		}
		seenChars[s.CharacterID] = true
		seenPositions[position] = true
		var name string
		var profession, score int
		var profileData []byte
		if err = tx.QueryRow(ctx, "SELECT name,profession_id,score,profile FROM characters WHERE id=$1 AND club_id=$2", s.CharacterID, club).Scan(&name, &profession, &score, &profileData); err != nil {
			return nil, err
		}
		if s.Config == nil {
			var profile Profile
			if err = json.Unmarshal(profileData, &profile); err != nil {
				return nil, err
			}
			s.Config = &SlotConfig{Loadout: profile.Default}
		}
		if s.Config.Relics == nil {
			s.Config.Relics = []Level{}
		}
		if err = validateLoadout(s.Config.Loadout, profession); err != nil {
			return nil, err
		}
		s.Config.Name = name
		s.Config.ProfessionID = profession
		s.Config.Score = score
	}
	if _, err = tx.Exec(ctx, "DELETE FROM slots WHERE event_id=$1", id); err != nil {
		return nil, err
	}
	for _, s := range input.Slots {
		b, _ := json.Marshal(s.Config)
		if _, err = tx.Exec(ctx, "INSERT INTO slots(event_id,team,position,character_id,config) VALUES($1,$2,$3,$4,$5)", id, s.Team, s.Position, s.CharacterID, b); err != nil {
			return nil, err
		}
	}
	_, err = tx.Exec(ctx, "UPDATE events SET revision=revision+1 WHERE id=$1", id)
	return map[string]int{"revision": revision + 1}, err
}
