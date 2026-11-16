import { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { api } from "./api";
import { Modal } from "./components";
import LoadoutEditor from "./LoadoutEditor";
import type { Catalog, Character, Level, Profile, Named } from "./types";

function SparseSkills({
  title,
  items,
  value,
  onChange,
}: {
  title: string;
  items: Named[];
  value: Level[];
  onChange: (v: Level[]) => void;
}) {
  const [pick, setPick] = useState("");
  return (
    <section>
      <h4>
        {title} <small>只添加常用技能</small>
      </h4>
      <div className="add-skill">
        <select
          aria-label={`添加${title}`}
          value={pick}
          onChange={(e) => setPick(e.target.value)}
        >
          <option value="">选择角色与技能…</option>
          {items
            .filter((x) => !value.some((v) => v.id === x.id))
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} · {x.skill}
              </option>
            ))}
        </select>
        <button
          type="button"
          disabled={!pick}
          onClick={() => {
            onChange([...value, { id: +pick, level: 1 }]);
            setPick("");
          }}
        >
          <Plus size={16} />
          添加
        </button>
      </div>
      <div className="sparse-skills">
        {value.map((x) => {
          const item = items.find((i) => i.id === x.id)!;
          return (
            <div className="sparse-row" key={x.id}>
              <div>
                <b>{item.name}</b>
                <small>{item.skill}</small>
              </div>
              <label>
                Lv.
                <input
                  aria-label={`${item.name}技能等级`}
                  type="number"
                  min={1}
                  max={100}
                  value={x.level}
                  onChange={(e) =>
                    onChange(
                      value.map((v) =>
                        v.id === x.id ? { ...v, level: +e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="icon danger"
                aria-label={`移除${item.name}`}
                onClick={() => onChange(value.filter((v) => v.id !== x.id))}
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
export default function CharacterEditor({
  catalog,
  character,
  onClose,
  onSaved,
}: {
  catalog: Catalog;
  character?: Character;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const initialProfession =
    character?.profession_id ?? catalog.talents[0].professionId!;
  const [name, setName] = useState(character?.name ?? "");
  const [profession, setProfession] = useState(initialProfession);
  const [score, setScore] = useState(character?.score ?? 0);
  const [profile, setProfile] = useState<Profile>(
    character
      ? structuredClone(character.profile)
      : {
          relics: [],
          puppets: [],
          fellows: [],
          default: {
            talentId: catalog.talents.find(
              (x) => x.professionId === initialProfession,
            )!.id,
            healing: "",
            relics: [],
            puppet: null,
            fellow: null,
          },
        },
  );
  const [tab, setTab] = useState("profile");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function skills(kind: "puppets" | "fellows", value: Level[]) {
    const key = kind === "puppets" ? "puppet" : "fellow";
    const current = profile.default[key];
    setProfile({
      ...profile,
      [kind]: value,
      default: {
        ...profile.default,
        [key]: current
          ? (value.find((x) => x.id === current.id) ?? null)
          : null,
      },
    });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      // The default carried skills are also part of the sparse character inventory.
      const add = (list: Level[], v: Level | null) =>
        v ? [...list.filter((x) => x.id !== v.id), v] : list;
      const merged = {
        ...profile,
        puppets: add(profile.puppets, profile.default.puppet),
        fellows: add(profile.fellows, profile.default.fellow),
        relics: profile.relics,
      };
      for (const r of profile.default.relics) {
        const owned = merged.relics.find((x) => x.id === r.id);
        if (!owned || owned.level !== r.level)
          throw new Error("默认携带的封印物等级须与角色档案一致");
      }
      await api(
        "/characters" + (character ? "/" + character.id : ""),
        character ? "PUT" : "POST",
        { name, professionId: profession, score, profile: merged },
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
    <Modal
      title={character ? "编辑角色档案" : "创建新角色"}
      onClose={onClose}
      wide
    >
      <form onSubmit={save}>
        <div className="modal-body">
          <div className="form-grid">
            <label>
              角色名称
              <input
                required
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入游戏内角色名称"
              />
            </label>
            <label>
              职业 / 途径
              <select
                value={profession}
                onChange={(e) => {
                  const id = +e.target.value;
                  setProfession(id);
                  const talent = catalog.talents.find(
                    (x) => x.professionId === id,
                  )!;
                  setProfile({
                    ...profile,
                    default: {
                      ...profile.default,
                      talentId: talent.id,
                      healing: talent.id === 201 ? "other" : "",
                    },
                  });
                }}
              >
                {catalog.professions
                  .filter((x) =>
                    catalog.talents.some((t) => t.professionId === x.id),
                  )
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.sequenceName} · {x.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              非凡评分
              <input
                type="number"
                required
                min={0}
                max={2147483647}
                value={score}
                onChange={(e) => setScore(+e.target.value)}
              />
            </label>
          </div>
          <div className="tabs">
            <button
              type="button"
              className={tab === "profile" ? "active" : ""}
              onClick={() => setTab("profile")}
            >
              封印物与技能
            </button>
            <button
              type="button"
              className={tab === "default" ? "active" : ""}
              onClick={() => setTab("default")}
            >
              默认出战配置
            </button>
          </div>
          {tab === "profile" ? (
            <>
              <h4>
                封印物收藏 <small>18 个 · 未拥有可留空 · 0 级最高</small>
              </h4>
              <div className="inventory">
                {catalog.relics.map((x) => (
                  <label key={x.id} title={x.description}>
                    <span>
                      {x.name}
                      <small>{x.groupName}</small>
                    </span>
                    <select
                      aria-label={`${x.name}等级`}
                      value={
                        profile.relics.find((r) => r.id === x.id)?.level ?? ""
                      }
                      onChange={(e) => {
                        const rest = profile.relics.filter(
                          (r) => r.id !== x.id,
                        );
                        const relics =
                          e.target.value === ""
                            ? rest
                            : [...rest, { id: x.id, level: +e.target.value }];
                        setProfile({
                          ...profile,
                          relics,
                          default: {
                            ...profile.default,
                            relics: profile.default.relics.flatMap((r) =>
                              r.id === x.id
                                ? e.target.value === ""
                                  ? []
                                  : [{ ...r, level: +e.target.value }]
                                : [r],
                            ),
                          },
                        });
                      }}
                    >
                      <option value="">未拥有</option>
                      {[3, 2, 1, 0].map((l) => (
                        <option key={l} value={l}>
                          {l} 级
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <SparseSkills
                title="秘偶技能"
                items={catalog.puppets}
                value={profile.puppets}
                onChange={(v) => skills("puppets", v)}
              />
              <SparseSkills
                title="人脉技能"
                items={catalog.fellows}
                value={profile.fellows}
                onChange={(v) => skills("fellows", v)}
              />
            </>
          ) : (
            <>
              <p className="notice">
                角色首次加入团队时，会自动使用此配置；活动中的调整独立保存。
              </p>
              <LoadoutEditor
                inventory={profile}
                catalog={{
                  ...catalog,
                  puppets: catalog.puppets.filter((x) =>
                    profile.puppets.some((p) => p.id === x.id),
                  ),
                  fellows: catalog.fellows.filter((x) =>
                    profile.fellows.some((p) => p.id === x.id),
                  ),
                }}
                profession={profession}
                value={profile.default}
                relics={catalog.relics.filter((x) =>
                  profile.relics.some((r) => r.id === x.id),
                )}
                onChange={(v) =>
                  setProfile({
                    ...profile,
                    default: {
                      ...v,
                      relics: v.relics.map(
                        (r) => profile.relics.find((x) => x.id === r.id)!,
                      ),
                    },
                  })
                }
              />
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "保存中…" : "保存角色"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
