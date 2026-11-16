package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWechatRegistrationAndLogin(t *testing.T) {
	app := testApp(t)
	app.wechatAppID = "test-app"
	app.wechatSecret = "test-secret"
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if q.Get("appid") != app.wechatAppID || q.Get("secret") != app.wechatSecret || q.Get("grant_type") != "authorization_code" {
			t.Error("invalid WeChat code exchange parameters")
		}
		w.Header().Set("Content-Type", "application/json")
		if q.Get("js_code") == "invalid" {
			_, _ = w.Write([]byte(`{"errcode":40029,"errmsg":"invalid code"}`))
			return
		}
		_, _ = w.Write([]byte(`{"openid":"wechat-test-openid","session_key":"never-return-this"}`))
	}))
	defer upstream.Close()
	app.wechatAuthURL = upstream.URL
	h := app.Handler()
	c := &client{t: t, h: h}
	c.call("GET", "/state", nil, 401)
	c.call("POST", "/auth/wechat", wechatCredentials{}, 400)
	c.call("POST", "/auth/wechat", wechatCredentials{Code: "invalid"}, 401)
	first := c.call("POST", "/auth/wechat", wechatCredentials{Code: "first", DisplayName: "非凡者"}, 200)
	id := stringField(first, "id")
	if id == "" || c.cookie == nil || !c.cookie.HttpOnly {
		t.Fatal("WeChat login must create an account and an HttpOnly session")
	}
	state := c.call("GET", "/state", nil, 200)
	var me map[string]any
	if err := json.Unmarshal(state["me"], &me); err != nil {
		t.Fatal(err)
	}
	if me["display_name"] != "非凡者" || me["wechat_openid"] != "wechat-test-openid" {
		t.Fatalf("unexpected registered account: %v", me)
	}
	c.call("POST", "/auth/logout", nil, 200)
	c.call("GET", "/state", nil, 401)
	second := c.call("POST", "/auth/wechat", wechatCredentials{Code: "second"}, 200)
	if stringField(second, "id") != id {
		t.Fatal("the same WeChat identity must reuse the registered account")
	}
	var count int
	if err := app.db.QueryRow(t.Context(), "SELECT count(*) FROM users WHERE wechat_openid=$1", "wechat-test-openid").Scan(&count); err != nil || count != 1 {
		t.Fatalf("expected one account, count=%d err=%v", count, err)
	}
	app.wechatSecret = ""
	c.call("POST", "/auth/wechat", wechatCredentials{Code: "third"}, 503)
}
