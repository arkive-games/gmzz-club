import { useCallback, useEffect, useRef, useState } from "react";
import {
  Anchor,
  LayoutDashboard,
  CalendarDays,
  Users,
  UserRound,
  Compass,
  Shield,
  LogOut,
  ChevronRight,
  Plus,
  ArrowUpRight,
  Clock3,
  Check,
  Sun,
  Moon,
  Menu,
  X,
  Settings2,
  Trash2,
  Link2,
  Unlink,
  RefreshCw,
} from "lucide-react";
import { api } from "./api";
import { AddButton, Empty, Heading, Modal, SearchInput } from "./components";
import CharacterEditor from "./CharacterEditor";
import { LoadoutSummary } from "./LoadoutEditor";
import Lineup from "./Lineup";
import {
  date,
  localInput,
  nameOf,
  roles,
  type Catalog,
  type Character,
  type Club,
  type Detail,
  type Event,
  type State,
  type User,
} from "./types";

type Page =
  | "overview"
  | "events"
  | "members"
  | "characters"
  | "discover"
  | "admin";
const navigation = [
  { id: "overview", label: "俱乐部概览", icon: LayoutDashboard },
  { id: "events", label: "活动与团队", icon: CalendarDays },
  { id: "members", label: "成员管理", icon: Users },
  { id: "characters", label: "我的角色", icon: UserRound },
  { id: "discover", label: "发现俱乐部", icon: Compass },
] as const;

function Auth({ onDone }: { onDone: () => void }) {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/auth/" + (register ? "register" : "login"), "POST", {
        username: data.get("username"),
        password: data.get("password"),
        displayName: register ? data.get("displayName") : "",
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-art">
        <div className="brand">
          <Anchor size={26} />
          <span>
            ARKIVE <small>CLUB</small>
          </span>
        </div>
        <div className="auth-copy">
          <span className="eyebrow">LORD OF THE MYSTERIES</span>
          <h1>
            让每一次集结，
            <br />
            都有备而来。
          </h1>
          <p>
            从角色档案到团队配置，
            <br />
            与你的俱乐部一起，迎接未知。
          </p>
          <div className="orbit">✧</div>
        </div>
        <small>诡秘之主 · 俱乐部管理系统</small>
      </div>
      <div className="auth-form">
        <div className="eyebrow">WELCOME ABOARD</div>
        <h1>{register ? "创建你的账号" : "欢迎回到俱乐部"}</h1>
        <p className="muted">
          {register
            ? "一份账号，管理你的多个角色与俱乐部。"
            : "登录后，查看活动、管理角色与参与集结。"}
        </p>
        <form onSubmit={submit}>
          <label>
            用户名
            <input
              name="username"
              autoComplete="username"
              required
              minLength={3}
              maxLength={40}
              placeholder="你的登录用户名"
            />
          </label>
          {register && (
            <label>
              昵称
              <input
                name="displayName"
                required
                maxLength={40}
                placeholder="希望大家如何称呼你"
              />
            </label>
          )}
          <label>
            密码
            <input
              name="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              required
              minLength={register ? 10 : 1}
              maxLength={72}
              placeholder={register ? "至少 10 位字符" : "输入密码"}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy ? "请稍候…" : register ? "创建账号" : "登录"}
            <ArrowUpRight size={18} />
          </button>
        </form>
        <p className="auth-switch">
          {register ? "已经有账号？" : "还没有账号？"}
          <button
            className="text-button"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register ? "前往登录" : "注册账号"}
          </button>
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [clubId, setClubId] = useState("");
  const clubRef = useRef("");
  const [page, setPage] = useState<Page>("overview");
  const [eventId, setEventId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [characterModal, setCharacterModal] = useState<
    Character | "new" | null
  >(null);
  const [eventModal, setEventModal] = useState<Event | "new" | null>(null);
  const [clubModal, setClubModal] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("club-theme") ?? "light",
  );
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(Date.now());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 6000);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("club-theme", theme);
  }, [theme]);
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const now = tick + offset;
  const reload = useCallback(async () => {
    const fresh = await api<State>("/state");
    setOffset(new Date(fresh.now).getTime() - Date.now());
    setState(fresh);
    const chosen =
      fresh.clubs.find((c) => c.id === clubRef.current && c.role) ||
      fresh.clubs.find((c) => c.role);
    if (chosen) {
      clubRef.current = chosen.id;
      setClubId(chosen.id);
      setDetail(await api<Detail>("/clubs/" + chosen.id));
    } else {
      clubRef.current = "";
      setClubId("");
      setDetail(null);
    }
  }, []);
  const boot = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const c = await api<Catalog>("/catalog");
      setCatalog(c);
      await reload();
    } catch (e) {
      if ((e as { status?: number }).status === 401) setState(null);
      else setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [reload]);
  useEffect(() => {
    void boot();
  }, [boot]);
  const chooseClub = async (id: string) => {
    clubRef.current = id;
    setClubId(id);
    setDetail(null);
    setEventId("");
    try {
      await reload();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const act = async (
    path: string,
    method: string,
    body?: unknown,
    message = "已保存",
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      await api(path, method, body);
      await reload();
      notify(message);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const navigate = (p: Page) => {
    setPage(p);
    setEventId("");
    setQuery("");
    setMobile(false);
  };
  if (loading)
    return (
      <div className="loading">
        <Anchor size={32} />
        <p>正在打开俱乐部…</p>
      </div>
    );
  if (loadError)
    return (
      <div className="loading">
        <p className="error">{loadError}</p>
        <button onClick={boot}>
          <RefreshCw size={16} />
          重新连接
        </button>
      </div>
    );
  if (!state || !catalog) return <Auth onDone={boot} />;
  const club = state.clubs.find((c) => c.id === clubId);
  const joined = state.clubs.filter((c) => c.role);
  const manager = !!detail && detail.role !== "member";
  const chosenEvent = detail?.events.find((e) => e.id === eventId);
  const future =
    detail?.events
      .filter((e) => new Date(e.starts_at).getTime() >= now)
      .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)) ?? [];
  const openEvents = future.filter((e) => new Date(e.deadline).getTime() > now);
  const title = navigation.find((x) => x.id === page)?.label ?? "平台管理";
  const openEvent = (e: Event) => {
    setEventId(e.id);
    setPage("events");
  };
  const eventCard = (event: Event) => {
    const closed = now >= +new Date(event.deadline);
    const signups = detail!.signups.filter((s) => s.event_id === event.id);
    const occupied = detail!.slots.filter(
      (s) => s.event_id === event.id,
    ).length;
    const time = new Date(event.starts_at);
    return (
      <article className="event-card" key={event.id}>
        <div className="date-tile">
          <small>{time.toLocaleString("zh-CN", { month: "short" })}</small>
          <b>{time.getDate().toString().padStart(2, "0")}</b>
          <span>{time.toLocaleString("zh-CN", { weekday: "short" })}</span>
        </div>
        <div className="event-card-body">
          <div className="event-card-top">
            <span className={"badge " + (closed ? "" : "green")}>
              {closed ? "报名截止" : "开放报名"}
            </span>
            <span className="muted">{event.team_count} 个团队</span>
          </div>
          <button className="event-card-title" onClick={() => openEvent(event)}>
            {event.title}
            <ArrowUpRight size={18} />
          </button>
          <p>{event.description || "俱乐部活动，期待你的加入。"}</p>
          <div className="event-card-meta">
            <span>
              <CalendarDays size={14} />
              {date(event.starts_at)}
            </span>
            <span>
              <Clock3 size={14} />
              截止 {date(event.deadline)}
            </span>
          </div>
          <div className="event-card-footer">
            <span>
              <Users size={14} /> {signups.length} 已报名 <i /> {occupied}/
              {event.team_count * 30} 已编排
            </span>
            <button onClick={() => openEvent(event)}>
              查看团队
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </article>
    );
  };
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobile ? "mobile-open" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <Anchor size={27} />
          <span>
            ARKIVE <small>CLUB</small>
          </span>
        </a>
        <div className="product-name">诡秘之主 · 俱乐部管理</div>
        <div className="club-switch">
          <label>当前俱乐部</label>
          {joined.length ? (
            <select
              aria-label="切换俱乐部"
              value={clubId}
              onChange={(e) => chooseClub(e.target.value)}
            >
              {joined.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <button onClick={() => navigate("discover")}>
              加入你的第一个俱乐部
              <Plus size={15} />
            </button>
          )}
          {club?.role && (
            <span>
              <span className="dot" />
              {roles[club.role]}权限
            </span>
          )}
        </div>
        <span className="nav-caption">工作空间</span>
        <nav>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-label={label}
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <Icon size={18} />
              {label}
              {id === "events" && openEvents.length > 0 && (
                <span className="nav-count">{openEvents.length}</span>
              )}
              {id === "members" && !!detail?.applications?.length && (
                <span className="nav-count warm">
                  {detail.applications.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        {state.me.is_admin && (
          <>
            <span className="nav-caption">平台管理</span>
            <nav>
              <button
                className={page === "admin" ? "active" : ""}
                onClick={() => navigate("admin")}
              >
                <Shield size={18} />
                俱乐部管理
              </button>
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span>✧</span>
            <div>
              <b>以非凡之名，集结</b>
              <small>每一个角色，都有自己的位置。</small>
            </div>
          </div>
          <div className="account">
            <span className="avatar">{state.me.display_name.slice(0, 1)}</span>
            <div>
              <b>{state.me.display_name}</b>
              <small>{state.me.is_admin ? "平台管理员" : "普通用户"}</small>
            </div>
            <button
              aria-label="退出登录"
              className="icon"
              onClick={async () => {
                await api("/auth/logout", "POST");
                setState(null);
                setDetail(null);
                clubRef.current = "";
                setClubId("");
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="关闭菜单"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon mobile-menu"
              onClick={() => setMobile(!mobile)}
              aria-label="打开菜单"
            >
              <Menu size={20} />
            </button>
            <span>工作空间</span>
            <ChevronRight size={14} />
            <b>{club?.name ?? "我的空间"}</b>
            <ChevronRight size={14} />
            <span>{title}</span>
          </div>
          <div className="topbar-actions">
            <span className="connection">
              <span className="dot" />
              已连接
            </span>
            <button
              className="icon"
              onClick={() =>
                void reload()
                  .then(() => notify("已刷新"))
                  .catch((e) => notify(e.message))
              }
              aria-label="刷新数据"
            >
              <RefreshCw size={16} />
            </button>
            <button
              className="icon"
              aria-label="切换主题"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <span className="avatar small">
              {state.me.display_name.slice(0, 1)}
            </span>
          </div>
        </header>
        <main>
          {chosenEvent && detail ? (
            <Lineup
              key={chosenEvent.id}
              event={chosenEvent}
              detail={detail}
              state={state}
              catalog={catalog}
              now={now}
              onBack={() => setEventId("")}
              reload={reload}
              notify={notify}
            />
          ) : (
            <>
              {page === "overview" && (
                <>
                  <Heading
                    eyebrow="YOUR CLUB, TOGETHER"
                    title={club ? club.name : "你的非凡之旅，从这里开始"}
                    description={
                      club
                        ? "角色、伙伴与下一场冒险，都在这里。"
                        : "先创建角色，再找到志同道合的俱乐部。"
                    }
                    action={
                      manager ? (
                        <AddButton onClick={() => setEventModal("new")}>
                          创建活动
                        </AddButton>
                      ) : (
                        <button onClick={() => navigate("characters")}>
                          <UserRound size={16} />
                          管理我的角色
                        </button>
                      )
                    }
                  />
                  <section className="welcome-banner">
                    <div>
                      <span className="eyebrow">BEYOND THE ORDINARY</span>
                      <h2>集结非凡，奔赴未知。</h2>
                      <p>
                        {club?.description ||
                          "记录每位伙伴的成长，让下一次团队集结更从容。"}
                      </p>
                      <button
                        onClick={() => navigate(club ? "events" : "discover")}
                      >
                        {club ? "查看俱乐部活动" : "发现俱乐部"}
                        <ArrowUpRight size={16} />
                      </button>
                    </div>
                    <div className="banner-symbol" aria-hidden="true">
                      <span>✧</span>
                      <i />
                      <i />
                    </div>
                  </section>
                  <div className="stats-grid">
                    {[
                      {
                        label: "俱乐部成员",
                        value: detail?.members.length ?? 0,
                        caption: "一起探索的伙伴",
                        icon: Users,
                      },
                      {
                        label: "已绑定角色",
                        value: detail?.characters.length ?? 0,
                        caption: "每份非凡，各有所长",
                        icon: UserRound,
                      },
                      {
                        label: "待参加活动",
                        value: future.length,
                        caption: `${openEvents.length} 场正在报名`,
                        icon: CalendarDays,
                      },
                      {
                        label: "我的角色",
                        value: state.characters.length,
                        caption: `已加入 ${joined.length} 个俱乐部`,
                        icon: Shield,
                      },
                    ].map(({ label, value, caption, icon: Icon }, i) => (
                      <section className={"stat-card stat-" + i} key={label}>
                        <div>
                          <span>{label}</span>
                          <Icon size={19} />
                        </div>
                        <b>{value.toString().padStart(2, "0")}</b>
                        <small>{caption}</small>
                      </section>
                    ))}
                  </div>
                  <div className="section-heading">
                    <div>
                      <h2>即将开始</h2>
                      <span>留出时间，为下一次冒险做好准备</span>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("events")}
                    >
                      全部活动
                      <ChevronRight size={15} />
                    </button>
                  </div>
                  <div className="events-grid">
                    {future.slice(0, 2).map(eventCard)}
                  </div>
                  {!future.length && (
                    <Empty title="下一场冒险，等待开启">
                      <p>
                        {manager
                          ? "创建活动，邀请伙伴报名集结。"
                          : club
                            ? "俱乐部暂时没有即将开始的活动。"
                            : "加入俱乐部后，就能查看和报名活动。"}
                      </p>
                    </Empty>
                  )}
                  <div className="section-heading">
                    <div>
                      <h2>我的角色</h2>
                      <span>你的每一种非凡可能</span>
                    </div>
                    <AddButton onClick={() => setCharacterModal("new")}>
                      新建角色
                    </AddButton>
                  </div>
                  <div className="character-grid">
                    {state.characters.slice(0, 3).map((c) => (
                      <button
                        className="character-card"
                        key={c.id}
                        onClick={() => setCharacterModal(c)}
                      >
                        <span
                          className={
                            "pathway-icon large p" + (c.profession_id % 7)
                          }
                        >
                          {nameOf(catalog.professions, c.profession_id).slice(
                            0,
                            1,
                          )}
                        </span>
                        <div>
                          <h3>{c.name}</h3>
                          <p>{nameOf(catalog.professions, c.profession_id)}</p>
                          <span className="badge">
                            {state.clubs.find((x) => x.id === c.club_id)
                              ?.name ?? "尚未绑定俱乐部"}
                          </span>
                        </div>
                        <div className="character-score">
                          <small>非凡评分</small>
                          <b>{c.score.toLocaleString()}</b>
                        </div>
                      </button>
                    ))}
                  </div>
                  {!state.characters.length && (
                    <Empty title="创建你的第一个角色">
                      <p>记录途径、评分、封印物与常用技能。</p>
                    </Empty>
                  )}
                </>
              )}
              {page === "events" && (
                <>
                  <Heading
                    eyebrow="EVENTS & TEAMS"
                    title="活动与团队"
                    description="从报名到出战，让每次集结井然有序。"
                    action={
                      manager && (
                        <AddButton onClick={() => setEventModal("new")}>
                          创建活动
                        </AddButton>
                      )
                    }
                  />
                  <div className="section-tools">
                    <span className="badge">
                      {detail?.events.length ?? 0} 场活动
                    </span>
                    <SearchInput
                      value={query}
                      onChange={setQuery}
                      placeholder="搜索活动"
                    />
                  </div>
                  <div className="events-grid">
                    {detail?.events
                      .filter((e) => e.title.includes(query))
                      .map((e) => (
                        <div key={e.id}>
                          {eventCard(e)}
                          {manager && now < +new Date(e.deadline) && (
                            <button
                              className="text-button edit-event"
                              onClick={() => setEventModal(e)}
                            >
                              <Settings2 size={14} />
                              编辑活动信息
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                  {!detail?.events.length && (
                    <Empty title={club ? "暂无活动" : "请先加入俱乐部"}>
                      <p>活动由俱乐部会长或管理员发起。</p>
                    </Empty>
                  )}
                </>
              )}
              {page === "characters" && (
                <>
                  <Heading
                    eyebrow="CHARACTER ARCHIVE"
                    title="我的角色"
                    description="独立记录每个角色的成长，默认配置会在编排时自动带入。"
                    action={
                      <AddButton onClick={() => setCharacterModal("new")}>
                        创建角色
                      </AddButton>
                    }
                  />
                  <div className="section-tools">
                    <span>{state.characters.length} 个角色</span>
                    <SearchInput
                      value={query}
                      onChange={setQuery}
                      placeholder="搜索我的角色"
                    />
                  </div>
                  <div className="profiles-grid">
                    {state.characters
                      .filter((c) => c.name.includes(query))
                      .map((c) => (
                        <section className="profile-card" key={c.id}>
                          <div className="profile-top">
                            <span
                              className={
                                "pathway-icon large p" + (c.profession_id % 7)
                              }
                            >
                              {nameOf(
                                catalog.professions,
                                c.profession_id,
                              ).slice(0, 1)}
                            </span>
                            <div>
                              <h3>{c.name}</h3>
                              <p>
                                {nameOf(catalog.professions, c.profession_id)} ·{" "}
                                {c.score.toLocaleString()} 分
                              </p>
                            </div>
                            <button
                              className="icon"
                              aria-label={`编辑${c.name}`}
                              onClick={() => setCharacterModal(c)}
                            >
                              <Settings2 size={17} />
                            </button>
                          </div>
                          <span className="badge">
                            {state.clubs.find((x) => x.id === c.club_id)
                              ?.name ?? "未绑定俱乐部"}
                          </span>
                          <LoadoutSummary
                            value={c.profile.default}
                            catalog={catalog}
                          />
                          <div className="profile-footer">
                            <span>
                              {c.profile.puppets.length} 秘偶技能 ·{" "}
                              {c.profile.fellows.length} 人脉技能
                            </span>
                            <button
                              className="icon danger"
                              aria-label={`删除${c.name}`}
                              onClick={() => {
                                if (
                                  confirm(
                                    `删除角色“${c.name}”？关联报名和团队位置会一并移除。`,
                                  )
                                )
                                  void act(
                                    "/characters/" + c.id,
                                    "DELETE",
                                    undefined,
                                    "角色已删除",
                                  );
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </section>
                      ))}
                  </div>
                  {!state.characters.length && (
                    <Empty title="还没有角色档案">
                      <p>点击“创建角色”，开启你的第一份档案。</p>
                    </Empty>
                  )}
                </>
              )}
              {page === "members" && (
                <>
                  <Heading
                    eyebrow="MEMBERS & ROLES"
                    title="成员管理"
                    description="会长、管理员与成员，协作有序，各有所长。"
                  />
                  {detail && club ? (
                    <>
                      {manager && (
                        <section className="panel applications">
                          <div className="panel-title">
                            <h3>入会申请</h3>
                            <span className="count">
                              {detail.applications?.length ?? 0}
                            </span>
                          </div>
                          {detail.applications?.length ? (
                            detail.applications.map((ap) => (
                              <div className="member-row" key={ap.user_id}>
                                <span className="avatar">
                                  {ap.display_name.slice(0, 1)}
                                </span>
                                <div className="member-name">
                                  <b>{ap.display_name}</b>
                                  <small>
                                    @{ap.username} · {date(ap.created_at)}
                                  </small>
                                </div>
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    act(
                                      `/clubs/${clubId}/applications/${ap.user_id}`,
                                      "PUT",
                                      { accept: false },
                                      "申请已拒绝",
                                    )
                                  }
                                >
                                  拒绝
                                </button>
                                <button
                                  className="primary"
                                  disabled={busy}
                                  onClick={() =>
                                    act(
                                      `/clubs/${clubId}/applications/${ap.user_id}`,
                                      "PUT",
                                      { accept: true },
                                      "已批准入会",
                                    )
                                  }
                                >
                                  <Check size={15} />
                                  通过申请
                                </button>
                              </div>
                            ))
                          ) : (
                            <p className="hint">目前没有待审核申请。</p>
                          )}
                        </section>
                      )}
                      <section className="panel">
                        <div className="panel-title">
                          <h3>俱乐部成员</h3>
                          <span className="count">{detail.members.length}</span>
                          <SearchInput
                            value={query}
                            onChange={setQuery}
                            placeholder="搜索成员或角色"
                          />
                        </div>
                        {detail.members
                          .filter((m) =>
                            (
                              m.display_name +
                              m.username +
                              detail.characters
                                .filter((c) => c.user_id === m.id)
                                .map((c) => c.name)
                                .join("")
                            ).includes(query),
                          )
                          .map((m) => (
                            <div className="member-block" key={m.id}>
                              <div className="member-row">
                                <span className="avatar">
                                  {m.display_name.slice(0, 1)}
                                </span>
                                <div className="member-name">
                                  <b>
                                    {m.display_name}
                                    {m.id === state.me.id && (
                                      <small className="inline">你</small>
                                    )}
                                  </b>
                                  <small>@{m.username}</small>
                                </div>
                                {detail.role === "owner" ? (
                                  <select
                                    aria-label={`${m.display_name}权限`}
                                    disabled={busy}
                                    value={m.role}
                                    onChange={(e) => {
                                      if (
                                        confirm(
                                          `将 ${m.display_name} 的权限改为${roles[e.target.value as keyof typeof roles]}？`,
                                        )
                                      )
                                        void act(
                                          `/clubs/${clubId}/members/${m.id}`,
                                          "PUT",
                                          { role: e.target.value },
                                          "权限已更新",
                                        );
                                    }}
                                  >
                                    {Object.entries(roles).map(
                                      ([value, label]) => (
                                        <option key={value} value={value}>
                                          {label}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                ) : (
                                  <span className="badge">{roles[m.role]}</span>
                                )}
                                {(m.id === state.me.id ||
                                  detail.role === "owner" ||
                                  (detail.role === "admin" &&
                                    m.role === "member")) && (
                                  <button
                                    className="danger"
                                    disabled={busy}
                                    onClick={() => {
                                      const self = m.id === state.me.id;
                                      if (
                                        confirm(
                                          self
                                            ? "确认退出？角色将解除绑定；如果你是唯一成员，俱乐部将解散。"
                                            : `确认移除 ${m.display_name}？其角色将解除绑定。`,
                                        )
                                      )
                                        void act(
                                          `/clubs/${clubId}/members/${m.id}`,
                                          "DELETE",
                                          undefined,
                                          self ? "已退出俱乐部" : "成员已移除",
                                        );
                                    }}
                                  >
                                    {m.id === state.me.id ? "退出" : "移除"}
                                  </button>
                                )}
                              </div>
                              <div className="bound-characters">
                                {detail.characters
                                  .filter((c) => c.user_id === m.id)
                                  .map((c) => (
                                    <span
                                      className="bound-character"
                                      key={c.id}
                                    >
                                      <span
                                        className={
                                          "mini-path p" + (c.profession_id % 7)
                                        }
                                      />
                                      <b>{c.name}</b>
                                      <small>
                                        {nameOf(
                                          catalog.professions,
                                          c.profession_id,
                                        )}{" "}
                                        · {c.score.toLocaleString()}
                                      </small>
                                      {(manager || m.id === state.me.id) && (
                                        <button
                                          className="icon danger"
                                          aria-label={`解除${c.name}绑定`}
                                          onClick={() => {
                                            if (
                                              confirm(
                                                `解除 ${c.name} 的绑定？关联活动报名与排团位置将被移除。`,
                                              )
                                            )
                                              void act(
                                                `/clubs/${clubId}/characters/${c.id}`,
                                                "PUT",
                                                { bound: false },
                                                "绑定已解除",
                                              );
                                          }}
                                        >
                                          <Unlink size={13} />
                                        </button>
                                      )}
                                    </span>
                                  ))}
                                {!detail.characters.some(
                                  (c) => c.user_id === m.id,
                                ) && (
                                  <small className="hint">尚未绑定角色</small>
                                )}
                                {m.id === state.me.id &&
                                  state.characters.some((c) => !c.club_id) && (
                                    <select
                                      aria-label="绑定角色"
                                      disabled={busy}
                                      value=""
                                      onChange={(e) => {
                                        if (e.target.value)
                                          void act(
                                            `/clubs/${clubId}/characters/${e.target.value}`,
                                            "PUT",
                                            { bound: true },
                                            "角色已绑定",
                                          );
                                      }}
                                    >
                                      <option value="">＋ 绑定我的角色</option>
                                      {state.characters
                                        .filter((c) => !c.club_id)
                                        .map((c) => (
                                          <option key={c.id} value={c.id}>
                                            {c.name}
                                          </option>
                                        ))}
                                    </select>
                                  )}
                              </div>
                            </div>
                          ))}
                      </section>
                      <p className="hint policy">
                        <Shield size={14} />
                        只有会长可更改权限；管理员可移除普通成员及解除角色绑定。最后一位会长须先转移权限才能退出。
                      </p>
                    </>
                  ) : (
                    <Empty title="请先加入一个俱乐部" />
                  )}
                </>
              )}
              {(page === "discover" || page === "admin") && (
                <>
                  <Heading
                    eyebrow={
                      page === "admin"
                        ? "PLATFORM ADMINISTRATION"
                        : "FIND YOUR PEOPLE"
                    }
                    title={page === "admin" ? "俱乐部管理" : "发现俱乐部"}
                    description={
                      page === "admin"
                        ? "为伙伴创建新的俱乐部，指定首位会长；创建者不会自动加入。"
                        : "找到同行的伙伴。提交申请，经管理员审核后加入。"
                    }
                    action={
                      page === "admin" &&
                      state.me.is_admin && (
                        <AddButton onClick={() => setClubModal(true)}>
                          创建俱乐部
                        </AddButton>
                      )
                    }
                  />
                  <div className="section-tools">
                    <span>{state.clubs.length} 个俱乐部</span>
                    <SearchInput
                      value={query}
                      onChange={setQuery}
                      placeholder="搜索俱乐部"
                    />
                  </div>
                  <div className="clubs-grid">
                    {state.clubs
                      .filter((c) => (c.name + c.description).includes(query))
                      .map((c, i) => (
                        <section className="club-card" key={c.id}>
                          <div className={"club-emblem emblem-" + (i % 3)}>
                            <Anchor size={28} />
                          </div>
                          <h3>{c.name}</h3>
                          <p>
                            {c.description || "新的旅程，等待志同道合的你。"}
                          </p>
                          <div className="club-card-footer">
                            <span>
                              <Users size={15} />
                              {c.member_count} 位成员
                            </span>
                            {c.role ? (
                              <button
                                onClick={() =>
                                  void chooseClub(c.id).then(() =>
                                    navigate("overview"),
                                  )
                                }
                              >
                                进入俱乐部
                                <ArrowUpRight size={15} />
                              </button>
                            ) : (
                              <button
                                disabled={
                                  busy || c.application_status === "pending"
                                }
                                className={
                                  c.application_status === "pending"
                                    ? ""
                                    : "primary"
                                }
                                onClick={() =>
                                  act(
                                    `/clubs/${c.id}/applications`,
                                    "POST",
                                    undefined,
                                    "申请已提交，请等待审核",
                                  )
                                }
                              >
                                {c.application_status === "pending"
                                  ? "等待审核"
                                  : c.application_status === "rejected"
                                    ? "重新申请"
                                    : "申请加入"}
                              </button>
                            )}
                          </div>
                        </section>
                      ))}
                  </div>
                  {!state.clubs.length && (
                    <Empty title="暂无俱乐部">
                      <p>
                        {state.me.is_admin
                          ? "创建第一个俱乐部，指定一名已注册用户为会长。"
                          : "请等待平台管理员创建俱乐部。"}
                      </p>
                    </Empty>
                  )}
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              ARKIVE CLUB <i />
              以非凡之名，集结
            </span>
            <span>诡秘之主 · 俱乐部管理系统</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            className="icon"
            onClick={() => setToast("")}
            aria-label="关闭提示"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {characterModal && (
        <CharacterEditor
          catalog={catalog}
          character={characterModal === "new" ? undefined : characterModal}
          onClose={() => setCharacterModal(null)}
          onSaved={reload}
        />
      )}
      {eventModal && club && (
        <EventEditor
          club={club}
          event={eventModal === "new" ? undefined : eventModal}
          onClose={() => setEventModal(null)}
          onSaved={reload}
        />
      )}
      {clubModal && (
        <ClubEditor onClose={() => setClubModal(false)} onSaved={reload} />
      )}
    </div>
  );
}

function EventEditor({
  club,
  event,
  onClose,
  onSaved,
}: {
  club: Club;
  event?: Event;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError("");
    setBusy(true);
    try {
      await api(
        event ? "/events/" + event.id : `/clubs/${club.id}/events`,
        event ? "PUT" : "POST",
        {
          title: data.get("title"),
          description: data.get("description"),
          startsAt: new Date(data.get("startsAt") as string).toISOString(),
          deadline: new Date(data.get("deadline") as string).toISOString(),
          teamCount: Number(data.get("teamCount")),
        },
      );
      await onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={event ? "编辑活动" : "创建俱乐部活动"} onClose={onClose}>
      <form onSubmit={save}>
        <div className="modal-body">
          <label>
            活动名称
            <input
              name="title"
              required
              maxLength={100}
              defaultValue={event?.title}
              placeholder="例如：周六晚间 · 团队集结"
            />
          </label>
          <label>
            活动说明
            <textarea
              name="description"
              maxLength={3000}
              rows={3}
              defaultValue={event?.description}
              placeholder="活动目标、集合地点或准备事项"
            />
          </label>
          <label>
            活动时间
            <input
              type="datetime-local"
              name="startsAt"
              required
              defaultValue={localInput(
                event?.starts_at ?? new Date(Date.now() + 86400000),
              )}
            />
          </label>
          <label>
            报名截止时间
            <input
              type="datetime-local"
              name="deadline"
              required
              defaultValue={localInput(
                event?.deadline ?? new Date(Date.now() + 82800000),
              )}
            />
          </label>
          <label>
            团队数量
            <input
              name="teamCount"
              type="number"
              min={1}
              max={20}
              required
              defaultValue={event?.team_count ?? 3}
            />
          </label>
          <p className="notice">
            每个团队 5 个小队，每队 6
            个角色。截止后不能报名或取消，活动时间也将锁定；管理员仍可调整团队配置。
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "保存中…" : event ? "保存活动" : "创建活动"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ClubEditor({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [owner, setOwner] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (query.trim().length >= 2)
        void api<User[]>("/users?q=" + encodeURIComponent(query))
          .then((x) => {
            if (active) setUsers(x);
          })
          .catch((e) => {
            if (active) setError(e.message);
          });
      else setUsers([]);
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/clubs", "POST", {
        name: data.get("name"),
        description: data.get("description"),
        ownerId: owner,
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="创建俱乐部" onClose={onClose}>
      <form onSubmit={save}>
        <div className="modal-body">
          <label>
            俱乐部名称
            <input
              name="name"
              required
              maxLength={60}
              placeholder="为新的冒险命名"
            />
          </label>
          <label>
            俱乐部简介
            <textarea name="description" rows={3} maxLength={1000} />
          </label>
          <label>
            查找首位会长
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOwner("");
              }}
              placeholder="输入至少 2 个字的昵称或用户名"
            />
          </label>
          <label>
            指定首位会长
            <select
              required
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            >
              <option value="">选择已注册用户</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name} (@{u.username})
                </option>
              ))}
            </select>
          </label>
          <p className="notice">
            指定其他用户为首位会长。创建者不会自动加入该俱乐部；如需加入，请提交入会申请。
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button disabled={busy} className="primary">
            {busy ? "创建中…" : "创建俱乐部"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
