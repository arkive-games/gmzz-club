import { useRef, useState, type DragEvent } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  Users,
  Plus,
  Check,
  Trash2,
  Printer,
  ShieldCheck,
  GripVertical,
} from "lucide-react";
import { api } from "./api";
import { Modal, SearchInput, Empty, PathwayFilter } from "./components";
import LoadoutEditor, { LoadoutSummary } from "./LoadoutEditor";
import {
  nameOf,
  date,
  type Catalog,
  type Character,
  type Detail,
  type Event,
  type Slot,
  type State,
  type Loadout,
} from "./types";

export default function Lineup({
  event,
  detail,
  state,
  catalog,
  now,
  onBack,
  reload,
  notify,
}: {
  event: Event;
  detail: Detail;
  state: State;
  catalog: Catalog;
  now: number;
  onBack: () => void;
  reload: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const editable = detail.role !== "member";
  const [team, setTeam] = useState(1);
  const [search, setSearch] = useState("");
  const [onlyRegistered, setOnlyRegistered] = useState(false);
  const [pathway, setPathway] = useState<number | null>(null);
  const [selected, setSelected] = useState<Character | null>(null);
  const [editing, setEditing] = useState<Slot | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const drag = useRef<{ id: string; revision: number } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<number | null>(null);
  const suppressClickUntil = useRef(0);
  const slots = detail.slots.filter((x) => x.event_id === event.id);
  const signups = detail.signups.filter((x) => x.event_id === event.id);
  const registered = new Set(signups.map((x) => x.character_id));
  const used = new Set(slots.map((x) => x.character_id));
  const closed = now >= new Date(event.deadline).getTime();
  const candidates = detail.characters
    .filter(
      (x) =>
        !used.has(x.id) &&
        (pathway === null || x.profession_id === pathway) &&
        (!onlyRegistered || registered.has(x.id)) &&
        (
          x.name +
          nameOf(catalog.professions, x.profession_id) +
          (x.display_name ?? "")
        ).includes(search),
    )
    .sort(
      (a, b) =>
        Number(registered.has(b.id)) - Number(registered.has(a.id)) ||
        b.score - a.score,
    );
  async function save(next: Slot[], revision = event.revision) {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    try {
      await api("/events/" + event.id + "/lineup", "PUT", {
        revision,
        slots: next.map(({ team, position, character_id, config }) => ({
          team,
          position,
          character_id,
          config,
        })),
      });
      await reload();
      return true;
    } catch (e) {
      notify((e as Error).message);
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function changeTeams(remove = false) {
    if (saving.current || !editable) return;
    if (
      remove &&
      !confirm(
        `删除团队 ${String(team).padStart(2, "0")}？该团队中的角色将返回待编排，报名记录保留；后续团队编号会顺延。`,
      )
    )
      return;
    saving.current = true;
    setBusy(true);
    try {
      const result = await api<{ teamCount: number }>(
        `/events/${event.id}/teams${remove ? "/" + team : ""}`,
        remove ? "DELETE" : "POST",
        { revision: event.revision },
      );
      await reload();
      setTeam(remove ? Math.min(team, result.teamCount) : result.teamCount);
      setSelected(null);
      setEditing(null);
      setTarget(null);
      notify(remove ? "团队已删除，角色已返回待编排" : "新团队已添加");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function startDrag(e: DragEvent<HTMLButtonElement>, id: string) {
    if (!editable || busy || saving.current) {
      e.preventDefault();
      return;
    }
    drag.current = { id, revision: event.revision };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-gmzz-character", id);
    setDraggedId(id);
    setSelected(null);
  }
  function endDrag() {
    drag.current = null;
    setDraggedId(null);
    setDropPosition(null);
    suppressClickUntil.current = Date.now() + 250;
  }
  function dragOver(e: DragEvent<HTMLButtonElement>, position: number) {
    if (!editable || busy || !drag.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropPosition(position);
  }
  async function drop(e: DragEvent<HTMLButtonElement>, position: number) {
    const moving = drag.current;
    if (!editable || busy || !moving) return;
    e.preventDefault();
    const transferredId = e.dataTransfer.getData(
      "application/x-gmzz-character",
    );
    endDrag();
    if (transferredId !== moving.id) return;
    const source = slots.find((s) => s.character_id === moving.id);
    if (source?.team === team && source.position === position) return;
    const destination = slots.find(
      (s) => s.team === team && s.position === position,
    );
    let next: Slot[];
    if (source) {
      next = slots.map((s) =>
        s === source
          ? { ...s, team, position }
          : s === destination
            ? { ...s, team: source.team, position: source.position }
            : s,
      );
    } else {
      const character = detail.characters.find((c) => c.id === moving.id);
      if (!character) return;
      next = slots.filter((s) => s !== destination);
      next.push({
        team,
        position,
        character_id: character.id,
        config: structuredClone(character.profile.default),
      });
    }
    if (await save(next, moving.revision)) {
      setTarget(null);
      notify(
        source
          ? destination
            ? "角色位置已交换"
            : "角色已移动"
          : destination
            ? "已替换角色，原角色已返回待编排"
            : "角色已加入团队",
      );
    }
  }
  const filter = (
    <PathwayFilter
      professions={catalog.professions.filter((p) =>
        catalog.talents.some((t) => t.professionId === p.id),
      )}
      value={pathway}
      onChange={(id) => {
        setPathway(id);
        setSelected(null);
      }}
    />
  );
  async function place(character: Character, position: number) {
    const next = slots.filter(
      (x) => !(x.team === team && x.position === position),
    );
    next.push({
      team,
      position,
      character_id: character.id,
      config: structuredClone(character.profile.default),
    });
    if (await save(next)) {
      setSelected(null);
      setTarget(null);
    }
  }
  async function signup(id: string, cancel: boolean) {
    setBusy(true);
    try {
      await api(`/events/${event.id}/signups/${id}`, cancel ? "DELETE" : "PUT");
      await reload();
      notify(cancel ? "已取消报名" : "报名成功");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const myCharacters = state.characters.filter(
    (x) => x.club_id === event.club_id,
  );
  const configNames = (slot: Slot) => ({
    name:
      slot.config.name ??
      detail.characters.find((x) => x.id === slot.character_id)?.name ??
      "角色",
    profession:
      slot.config.professionId ??
      detail.characters.find((x) => x.id === slot.character_id)?.profession_id,
  });
  return (
    <>
      <button className="back" onClick={onBack}>
        <ArrowLeft size={16} />
        返回活动列表
      </button>
      <div className="event-title">
        <div>
          <div className="eyebrow">EVENT / 团队配置</div>
          <h1>{event.title}</h1>
          <p className="event-meta">
            <span>
              <CalendarDays size={15} />
              {date(event.starts_at)}
            </span>
            <span>
              <Clock3 size={15} />
              截止 {date(event.deadline)}
            </span>
            <span className={"status " + (closed ? "muted" : "green")}>
              {closed ? "报名已截止" : "报名进行中"}
            </span>
          </p>
        </div>
        <button onClick={() => window.print()}>
          <Printer size={16} />
          打印配置
        </button>
      </div>
      {event.description && (
        <p className="event-description">{event.description}</p>
      )}
      <section className="signup-bar">
        <div>
          <ShieldCheck size={21} />
          <div>
            <b>我的活动报名</b>
            <small>
              {closed
                ? "报名与取消报名均已锁定"
                : "选择本俱乐部的角色报名，允许多个角色参加"}
            </small>
          </div>
        </div>
        <div className="signup-buttons">
          {myCharacters.length ? (
            myCharacters.map((c) => (
              <button
                disabled={closed || busy}
                key={c.id}
                className={registered.has(c.id) ? "signed" : ""}
                onClick={() => signup(c.id, registered.has(c.id))}
              >
                {registered.has(c.id) ? (
                  <Check size={15} />
                ) : (
                  <Plus size={15} />
                )}{" "}
                {c.name} · {registered.has(c.id) ? "已报名" : "报名"}
              </button>
            ))
          ) : (
            <span className="hint">请先在成员页面绑定角色</span>
          )}
        </div>
      </section>
      <div className={"lineup-layout " + (!editable ? "view-only" : "")}>
        <section className="team-area">
          <div className="team-toolbar">
            <div className="tabs compact">
              {Array.from({ length: event.team_count }, (_, i) => (
                <button
                  key={i}
                  disabled={busy}
                  onDragEnter={(e) => {
                    if (editable && !busy && drag.current) {
                      e.preventDefault();
                      setTeam(i + 1);
                      setDropPosition(null);
                    }
                  }}
                  onDragOver={(e) => {
                    if (editable && !busy && drag.current) e.preventDefault();
                  }}
                  className={team === i + 1 ? "active" : ""}
                  onClick={() => {
                    setTeam(i + 1);
                    setSelected(null);
                  }}
                >
                  团队 {String(i + 1).padStart(2, "0")}
                </button>
              ))}
            </div>
            <div className="team-actions">
              <span>{slots.filter((x) => x.team === team).length} / 30 人</span>
              {editable && (
                <>
                  <button
                    className="icon"
                    aria-label="增加团队"
                    title="增加团队"
                    disabled={busy || event.team_count >= 20}
                    onClick={() => void changeTeams()}
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    className="icon danger"
                    aria-label="删除当前团队"
                    title="删除当前团队"
                    disabled={busy || event.team_count <= 1}
                    onClick={() => void changeTeams(true)}
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="team-note">
            <span>
              <span className="dot" />
              已保存配置 · 成员共享
            </span>
            <span>
              {editable
                ? selected
                  ? `已选择 ${selected.name}，点击位置放入`
                  : "拖拽安排或交换位置 · 拖至团队标签可跨团移动 · 点击角色调整配置"
                : "查看模式 · 由会长与管理员编排"}
            </span>
          </div>
          <div className="team-scroll">
            <div className="team-grid">
              {Array.from({ length: 5 }, (_, squad) => (
                <div className={"squad squad-" + squad} key={squad}>
                  <div className="squad-head">
                    <span>第 {squad + 1} 小队</span>
                    <small>
                      {
                        slots.filter(
                          (x) =>
                            x.team === team &&
                            Math.floor(x.position / 6) === squad,
                        ).length
                      }
                      /6
                    </small>
                  </div>
                  {Array.from({ length: 6 }, (_, row) => {
                    const position = squad * 6 + row;
                    const slot = slots.find(
                      (x) => x.team === team && x.position === position,
                    );
                    const meta = slot ? configNames(slot) : null;
                    return (
                      <button
                        key={row}
                        disabled={busy}
                        onPointerDown={() => {
                          if (!drag.current) suppressClickUntil.current = 0;
                        }}
                        draggable={editable && !!slot && !busy}
                        onDragStart={(e) => {
                          if (slot) startDrag(e, slot.character_id);
                        }}
                        onDragEnd={endDrag}
                        onDragOver={(e) => dragOver(e, position)}
                        onDragLeave={(e) => {
                          if (
                            !e.currentTarget.contains(
                              e.relatedTarget as Node | null,
                            )
                          )
                            setDropPosition(null);
                        }}
                        onDrop={(e) => void drop(e, position)}
                        className={
                          "team-slot " +
                          (slot ? "occupied" : "vacant") +
                          (selected && !slot ? " ready" : "") +
                          (draggedId === slot?.character_id
                            ? " dragging"
                            : "") +
                          (draggedId && dropPosition === position
                            ? " drop-target"
                            : "")
                        }
                        aria-label={`第${squad + 1}小队第${row + 1}位${meta ? " " + meta.name : ""}`}
                        onClick={() => {
                          if (Date.now() < suppressClickUntil.current) return;
                          if (slot) {
                            setEditing(structuredClone(slot));
                          } else if (editable) {
                            if (selected) void place(selected, position);
                            else setTarget(position);
                          }
                        }}
                      >
                        {slot && meta ? (
                          <>
                            <div className="slot-top">
                              <span
                                className={
                                  "pathway-icon p" +
                                  ((meta.profession ?? 0) % 7)
                                }
                              >
                                {nameOf(
                                  catalog.professions,
                                  meta.profession,
                                ).slice(0, 1)}
                              </span>
                              <span className="slot-name">
                                <b>{meta.name}</b>
                                <small>
                                  {nameOf(
                                    catalog.talents,
                                    slot.config.talentId,
                                  )}
                                  {slot.config.healing === "yuxin"
                                    ? " · 愈心"
                                    : slot.config.healing === "other"
                                      ? " · 非愈心"
                                      : ""}
                                </small>
                              </span>
                              {editable && (
                                <GripVertical
                                  className="drag-handle"
                                  size={12}
                                />
                              )}
                            </div>
                            <div className="slot-skills">
                              <span>
                                秘偶 ·{" "}
                                {nameOf(
                                  catalog.puppets,
                                  slot.config.puppet?.id,
                                )}
                              </span>
                              <span>
                                人脉 ·{" "}
                                {nameOf(
                                  catalog.fellows,
                                  slot.config.fellow?.id,
                                )}
                              </span>
                            </div>
                            <div className="slot-relics">
                              {slot.config.relics.length ? (
                                slot.config.relics.map((r) => (
                                  <span key={r.id}>
                                    {nameOf(catalog.relics, r.id)}
                                    <em>{r.level}</em>
                                  </span>
                                ))
                              ) : (
                                <span className="muted">未设置封印物</span>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <Plus size={19} />
                            <span>{editable ? "安排角色" : "待安排"}</span>
                            <small>
                              {squad + 1}−{row + 1}
                            </small>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="team-legend">
            <span>
              <Users size={14} />5 个小队 · 每队 6 人
            </span>
            <span>
              已报名 {signups.length} · 已编排 {slots.length} · 待编排{" "}
              {
                detail.characters.filter(
                  (x) => registered.has(x.id) && !used.has(x.id),
                ).length
              }
            </span>
          </div>
        </section>
        {editable && (
          <aside className="candidate-panel">
            <div className="panel-title">
              <h3>待编排角色</h3>
              <span className="count">{candidates.length}</span>
            </div>
            <p className="hint">
              拖入团队位置 · 已报名优先 · 放入已占位置可替换角色
            </p>
            {filter}
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="搜索角色、途径或成员"
            />
            <label className="checkbox">
              <input
                type="checkbox"
                checked={onlyRegistered}
                onChange={(e) => setOnlyRegistered(e.target.checked)}
              />
              仅显示已报名
            </label>
            <div className="candidate-list">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  disabled={busy}
                  onPointerDown={() => {
                    if (!drag.current) suppressClickUntil.current = 0;
                  }}
                  draggable={!busy}
                  onDragStart={(e) => startDrag(e, c.id)}
                  onDragEnd={endDrag}
                  className={
                    "candidate " +
                    (selected?.id === c.id ? "selected" : "") +
                    (draggedId === c.id ? " dragging" : "")
                  }
                  onClick={() => {
                    if (Date.now() >= suppressClickUntil.current)
                      setSelected(selected?.id === c.id ? null : c);
                  }}
                >
                  <span className={"pathway-icon p" + (c.profession_id % 7)}>
                    {nameOf(catalog.professions, c.profession_id).slice(0, 1)}
                  </span>
                  <span>
                    <b>{c.name}</b>
                    <small>
                      {nameOf(catalog.professions, c.profession_id)} ·{" "}
                      {c.score.toLocaleString()}
                    </small>
                  </span>
                  <span
                    className={
                      "tiny-status " + (registered.has(c.id) ? "green" : "")
                    }
                  >
                    {registered.has(c.id) ? "已报名" : "未报名"}
                  </span>
                </button>
              ))}
              {!candidates.length && <Empty title="没有符合条件的待编排角色" />}
            </div>
          </aside>
        )}
      </div>
      {target !== null && (
        <Modal
          title={`安排角色 · 第 ${Math.floor(target / 6) + 1} 小队 / 第 ${(target % 6) + 1} 位`}
          onClose={() => setTarget(null)}
        >
          <div className="modal-body">
            {filter}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={onlyRegistered}
                onChange={(e) => setOnlyRegistered(e.target.checked)}
              />
              仅显示已报名
            </label>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="搜索角色、途径或成员"
            />
            {candidates.map((c) => (
              <button
                className="picker-row"
                disabled={busy}
                key={c.id}
                onClick={() => place(c, target)}
              >
                <span>
                  <b>{c.name}</b>
                  <small>
                    {nameOf(catalog.professions, c.profession_id)} · 评分{" "}
                    {c.score.toLocaleString()}
                  </small>
                </span>
                <span
                  className={registered.has(c.id) ? "badge green" : "badge"}
                >
                  {registered.has(c.id) ? "已报名" : "未报名"}
                </span>
              </button>
            ))}
            {!candidates.length && <Empty title="没有可安排的角色" />}
          </div>
        </Modal>
      )}
      {editing && (
        <Modal
          title={`${configNames(editing).name} · 出战配置`}
          onClose={() => setEditing(null)}
          wide
        >
          <div className="modal-body">
            {editable ? (
              <LoadoutEditor
                catalog={catalog}
                profession={configNames(editing).profession!}
                value={editing.config}
                onChange={(v: Loadout) => setEditing({ ...editing, config: v })}
              />
            ) : (
              <LoadoutSummary catalog={catalog} value={editing.config} />
            )}
          </div>
          <div className="modal-footer">
            {editable && (
              <button
                className="danger"
                disabled={busy}
                onClick={async () => {
                  if (
                    await save(
                      slots.filter(
                        (x) => x.character_id !== editing.character_id,
                      ),
                    )
                  )
                    setEditing(null);
                }}
              >
                <Trash2 size={15} />
                移出团队
              </button>
            )}
            <span className="spacer" />
            <button onClick={() => setEditing(null)}>关闭</button>
            {editable && (
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  if (
                    await save(
                      slots.map((s) =>
                        s.character_id === editing.character_id ? editing : s,
                      ),
                    )
                  )
                    setEditing(null);
                }}
              >
                保存配置
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
