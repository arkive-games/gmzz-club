package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestProfileValidation(t *testing.T) {
	c := Character{Name: "Test", ProfessionID: 1200001, Score: 12345, Profile: Profile{Default: Loadout{TalentID: 101}}}
	if err := validateCharacter(c); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name string
		edit func(*Character)
	}{
		{"foreign talent", func(c *Character) { c.Profile.Default.TalentID = 201 }},
		{"negative score", func(c *Character) { c.Score = -1 }},
		{"duplicate relic", func(c *Character) { c.Profile.Relics = []Level{{2085001, 0}, {2085001, 1}} }},
		{"unknown skill", func(c *Character) { c.Profile.Puppets = []Level{{-1, 1}} }},
		{"unowned default", func(c *Character) { c.Profile.Default.Puppet = &Level{100, 30} }},
		{"invalid healing category", func(c *Character) { c.Profile.Default.Healing = "yuxin" }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			copy := c
			tc.edit(&copy)
			if validateCharacter(copy) == nil {
				t.Fatal("expected rejection")
			}
		})
	}
	c.ProfessionID = 1200002
	c.Profile.Default = Loadout{TalentID: 201, Healing: "yuxin"}
	if err := validateCharacter(c); err != nil {
		t.Fatal(err)
	}
	c.Profile.Default.Healing = ""
	if validateCharacter(c) == nil {
		t.Fatal("healing spectator needs category")
	}
}

func testApp(t *testing.T) *App {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	schema := "clubtest_" + strings.ReplaceAll(uid(), "-", "")
	safe := pgx.Identifier{schema}.Sanitize()
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+safe); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, err := admin.Exec(ctx, "DROP SCHEMA "+safe+" CASCADE")
		if err != nil {
			t.Error(err)
		}
		admin.Close()
	})
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	app, err := New(ctx, u.String(), false)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Close)
	return app
}

type client struct {
	t      *testing.T
	h      http.Handler
	cookie *http.Cookie
	id     string
}

func (c *client) call(method, path string, body any, want int) map[string]json.RawMessage {
	c.t.Helper()
	data, _ := json.Marshal(body)
	req := httptest.NewRequest(method, "http://localhost/api"+path, bytes.NewReader(data))
	if c.cookie != nil {
		req.AddCookie(c.cookie)
	}
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c.h.ServeHTTP(rec, req)
	if rec.Code != want {
		c.t.Fatalf("%s %s: got %d want %d: %s", method, path, rec.Code, want, rec.Body.String())
	}
	for _, cookie := range rec.Result().Cookies() {
		if cookie.Name == "club_session" {
			c.cookie = cookie
		}
	}
	out := map[string]json.RawMessage{}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return out
}
func stringField(m map[string]json.RawMessage, key string) string {
	var s string
	_ = json.Unmarshal(m[key], &s)
	return s
}
func registerClient(t *testing.T, h http.Handler, name string) *client {
	c := &client{t: t, h: h}
	result := c.call("POST", "/auth/register", credentials{Username: name, Password: "Test-password-2026", DisplayName: name}, 200)
	c.id = stringField(result, "id")
	return c
}
func (c *client) character(name string) string {
	result := c.call("POST", "/characters", Character{Name: name, ProfessionID: 1200001, Score: 180000, Profile: Profile{Relics: []Level{{2085001, 0}}, Default: Loadout{TalentID: 101, Relics: []Level{{2085001, 0}}}}}, 200)
	return stringField(result, "id")
}

func TestPostgresWorkflow(t *testing.T) {
	app := testApp(t)
	var assets fs.FS = fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte("test")}}
	h := app.Handler(assets)
	ctx := context.Background()
	platform := registerClient(t, h, "platform")
	owner := registerClient(t, h, "owner")
	admin := registerClient(t, h, "admin")
	member := registerClient(t, h, "member")
	outsider := registerClient(t, h, "outsider")
	if err := app.Promote(ctx, "platform"); err != nil {
		t.Fatal(err)
	}
	create := map[string]any{"name": "Test Club", "description": "Integration testing", "ownerId": owner.id}
	member.call("POST", "/clubs", create, 403)
	club := stringField(platform.call("POST", "/clubs", create, 200), "id")
	base := "/clubs/" + club
	platform.call("GET", base, nil, 403)
	anonymous := &client{t: t, h: h}
	anonymous.call("GET", "/state", nil, 401)
	for _, c := range []*client{admin, member} {
		c.call("POST", base+"/applications", nil, 200)
		owner.call("PUT", base+"/applications/"+c.id, map[string]bool{"accept": true}, 200)
	}
	owner.call("PUT", base+"/members/"+admin.id, map[string]string{"role": "admin"}, 200)
	admin.call("PUT", base+"/members/"+member.id, map[string]string{"role": "owner"}, 403)
	admin.call("DELETE", base+"/members/"+owner.id, nil, 403)
	owner.call("PUT", base+"/members/"+owner.id, map[string]string{"role": "member"}, 409)
	owner.call("DELETE", base+"/members/"+owner.id, nil, 409)
	outsider.call("GET", base, nil, 403)
	outsider.call("POST", base+"/applications", nil, 200)
	outsider.call("POST", base+"/applications", nil, 409)
	member.call("PUT", base+"/applications/"+outsider.id, map[string]bool{"accept": true}, 403)
	admin.call("PUT", base+"/applications/"+outsider.id, map[string]bool{"accept": false}, 200)
	outsider.call("POST", base+"/applications", nil, 200)
	id := member.character("Member character")
	ownerChar := owner.character("Owner character")
	foreign := outsider.character("Foreign character")
	owner.call("PUT", base+"/characters/"+id, map[string]bool{"bound": true}, 403)
	outsider.call("PUT", base+"/characters/"+foreign, map[string]bool{"bound": true}, 403)
	member.call("PUT", base+"/characters/"+id, map[string]bool{"bound": true}, 200)
	member.call("PUT", base+"/characters/"+id, map[string]bool{"bound": true}, 409)
	owner.call("PUT", base+"/characters/"+ownerChar, map[string]bool{"bound": true}, 200)
	outsider.call("DELETE", "/characters/"+id, nil, 404)
	now := time.Now()
	input := EventInput{Title: "Raid", StartsAt: now.Add(3 * time.Hour), Deadline: now.Add(time.Hour), TeamCount: 2}
	member.call("POST", base+"/events", input, 403)
	event := stringField(admin.call("POST", base+"/events", input, 200), "id")
	eventBase := "/events/" + event
	outsider.call("PUT", eventBase+"/signups/"+foreign, nil, 403)
	owner.call("PUT", eventBase+"/signups/"+id, nil, 403)
	member.call("PUT", eventBase+"/signups/"+id, nil, 200)
	member.call("DELETE", eventBase+"/signups/"+id, nil, 200)
	member.call("PUT", eventBase+"/signups/"+id, nil, 200)
	lineup := map[string]any{"revision": 0, "slots": []Slot{{Team: 1, Position: 0, CharacterID: id}}}
	member.call("PUT", eventBase+"/lineup", lineup, 403)
	admin.call("PUT", eventBase+"/lineup", lineup, 200)
	admin.call("PUT", eventBase+"/lineup", lineup, 409)
	detail := member.call("GET", base, nil, 200)
	var slots []Slot
	if err := json.Unmarshal(detail["slots"], &slots); err != nil {
		t.Fatal(err)
	}
	if len(slots) != 1 || slots[0].Config.TalentID != 101 || slots[0].Config.Relics[0].Level != 0 {
		t.Fatalf("defaults not copied: %+v", slots)
	}
	if _, ok := detail["applications"]; ok {
		t.Fatal("member can see applications")
	}
	lineup["revision"] = 1
	lineup["slots"] = []Slot{{Team: 1, Position: 0, CharacterID: id}, {Team: 2, Position: 0, CharacterID: id}}
	admin.call("PUT", eventBase+"/lineup", lineup, 400)
	lineup["slots"] = []Slot{{Team: 1, Position: 30, CharacterID: id}}
	admin.call("PUT", eventBase+"/lineup", lineup, 400)
	lineup["slots"] = []Slot{{Team: 1, Position: 1, CharacterID: foreign}}
	admin.call("PUT", eventBase+"/lineup", lineup, 404)
	lineup["slots"] = []Slot{{Team: 1, Position: 1, CharacterID: id, Config: &SlotConfig{Loadout: Loadout{TalentID: 201, Healing: "yuxin"}}}}
	admin.call("PUT", eventBase+"/lineup", lineup, 400)
	// Lock at database time, then verify every route that could cancel a signup.
	if _, err := app.db.Exec(ctx, "UPDATE events SET deadline=clock_timestamp() WHERE id=$1", event); err != nil {
		t.Fatal(err)
	}
	member.call("PUT", eventBase+"/signups/"+id, nil, 409)
	member.call("DELETE", eventBase+"/signups/"+id, nil, 409)
	member.call("PUT", base+"/characters/"+id, map[string]bool{"bound": false}, 409)
	member.call("DELETE", base+"/members/"+member.id, nil, 409)
	member.call("DELETE", "/characters/"+id, nil, 409)
	admin.call("PUT", eventBase, input, 409)
	lineup["slots"] = []Slot{{Team: 2, Position: 29, CharacterID: id}}
	admin.call("PUT", eventBase+"/lineup", lineup, 200)
	// Administrative removal is still allowed and removes stale slots/signups.
	admin.call("PUT", base+"/characters/"+id, map[string]bool{"bound": false}, 200)
	var count int
	if err := app.db.QueryRow(ctx, "SELECT count(*) FROM slots WHERE event_id=$1", event).Scan(&count); err != nil || count != 0 {
		t.Fatal("unbind did not clean slots", err, count)
	}
	if err := app.db.QueryRow(ctx, "SELECT count(*) FROM signups WHERE event_id=$1", event).Scan(&count); err != nil || count != 0 {
		t.Fatal("unbind did not clean signups", err, count)
	}
	member.call("PUT", base+"/characters/"+id, map[string]bool{"bound": true}, 200)
	admin.call("DELETE", base+"/members/"+member.id, nil, 200)
	var binding *string
	if err := app.db.QueryRow(ctx, "SELECT club_id::text FROM characters WHERE id=$1", id).Scan(&binding); err != nil || binding != nil {
		t.Fatal("membership FK did not unbind", err)
	}
	// Last-owner checks serialize even with two owners demoting concurrently.
	owner.call("PUT", base+"/members/"+admin.id, map[string]string{"role": "owner"}, 200)
	var wg sync.WaitGroup
	codes := make(chan int, 2)
	for _, c := range []*client{owner, admin} {
		wg.Add(1)
		go func(c *client) {
			defer wg.Done()
			body := strings.NewReader(`{"role":"member"}`)
			req := httptest.NewRequest("PUT", "http://localhost/api"+base+"/members/"+c.id, body)
			req.AddCookie(c.cookie)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			codes <- rec.Code
		}(c)
	}
	wg.Wait()
	close(codes)
	succeeded, rejected := 0, 0
	for code := range codes {
		if code == 200 {
			succeeded++
		} else if code == 409 {
			rejected++
		} else {
			t.Errorf("unexpected status %d", code)
		}
	}
	if succeeded != 1 || rejected != 1 {
		t.Fatalf("concurrent owner updates: %d/%d", succeeded, rejected)
	}
	// Sole owner exit dissolves the club rather than leaving an ownerless shell.
	solo := stringField(platform.call("POST", "/clubs", map[string]string{"name": "Solo", "ownerId": outsider.id}, 200), "id")
	outsider.call("PUT", "/clubs/"+solo+"/characters/"+foreign, map[string]bool{"bound": true}, 200)
	outsider.call("DELETE", "/clubs/"+solo+"/members/"+outsider.id, nil, 200)
	if err := app.db.QueryRow(ctx, "SELECT club_id::text FROM characters WHERE id=$1", foreign).Scan(&binding); err != nil || binding != nil {
		t.Fatal("dissolution did not unbind", err)
	}
	// Cross-origin mutations cannot use the authenticated cookie.
	// Team changes work after cutoff, retain signup records and compact positions.
	teamClub := stringField(platform.call("POST", "/clubs", map[string]string{"name": "Teams", "ownerId": outsider.id}, 200), "id")
	teamChars := []string{outsider.character("Team one"), outsider.character("Team two"), outsider.character("Team three")}
	for _, c := range teamChars {
		outsider.call("PUT", "/clubs/"+teamClub+"/characters/"+c, map[string]bool{"bound": true}, 200)
	}
	teamEvent := stringField(outsider.call("POST", "/clubs/"+teamClub+"/events", map[string]any{"title": "Default teams", "startsAt": time.Now().Add(3 * time.Hour), "deadline": time.Now().Add(time.Hour)}, 200), "id")
	teamBase := "/events/" + teamEvent
	var teamCount int
	if err := app.db.QueryRow(ctx, "SELECT team_count FROM events WHERE id=$1", teamEvent).Scan(&teamCount); err != nil || teamCount != 3 {
		t.Fatal("new events must default to three teams", err, teamCount)
	}
	teamSlots := []Slot{}
	for i, c := range teamChars {
		outsider.call("PUT", teamBase+"/signups/"+c, nil, 200)
		teamSlots = append(teamSlots, Slot{Team: i + 1, Position: 0, CharacterID: c})
	}
	outsider.call("PUT", teamBase+"/lineup", map[string]any{"revision": 0, "slots": teamSlots}, 200)
	if _, err := app.db.Exec(ctx, "UPDATE events SET deadline=clock_timestamp() WHERE id=$1", teamEvent); err != nil {
		t.Fatal(err)
	}
	member.call("POST", teamBase+"/teams", map[string]int{"revision": 1}, 403)
	outsider.call("POST", teamBase+"/teams", map[string]int{"revision": 1}, 200)
	outsider.call("POST", teamBase+"/teams", map[string]int{"revision": 1}, 409)
	outsider.call("DELETE", teamBase+"/teams/1", map[string]int{"revision": 2}, 200)
	var movedID string
	if err := app.db.QueryRow(ctx, "SELECT character_id::text FROM slots WHERE event_id=$1 AND team=1 AND position=0", teamEvent).Scan(&movedID); err != nil || movedID != teamChars[1] {
		t.Fatal("team numbering did not compact", err, movedID)
	}
	if err := app.db.QueryRow(ctx, "SELECT count(*) FROM signups WHERE event_id=$1", teamEvent).Scan(&count); err != nil || count != 3 {
		t.Fatal("team deletion changed signups", err, count)
	}
	outsider.call("DELETE", teamBase+"/teams/3", map[string]int{"revision": 3}, 200)
	outsider.call("DELETE", teamBase+"/teams/2", map[string]int{"revision": 4}, 200)
	outsider.call("DELETE", teamBase+"/teams/1", map[string]int{"revision": 5}, 409)
	outsider.call("DELETE", teamBase+"/teams/0", map[string]int{"revision": 5}, 400)
	outsider.call("POST", teamBase+"/teams", map[string]int{}, 400)
	if _, err := app.db.Exec(ctx, "UPDATE events SET team_count=20 WHERE id=$1", teamEvent); err != nil {
		t.Fatal(err)
	}
	outsider.call("POST", teamBase+"/teams", map[string]int{"revision": 5}, 400)
	req := httptest.NewRequest("POST", "http://localhost/api/clubs", strings.NewReader("{}"))
	req.AddCookie(platform.cookie)
	req.Header.Set("Origin", "https://example.org")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 403 {
		t.Fatal("CSRF accepted")
	}
	member.call("POST", "/auth/logout", nil, 200)
	member.call("GET", "/state", nil, 401)
	t.Log(fmt.Sprintf("Verified permissions, approval, binding, cutoff, defaults, revision, cleanup and concurrent owner protection"))
}
