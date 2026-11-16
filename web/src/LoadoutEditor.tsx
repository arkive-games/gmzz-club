import type { Catalog, Level, Loadout, Named, Profile } from "./types";
import { nameOf } from "./types";

export function SkillPicker({
  label,
  items,
  value,
  onChange,
  levels,
}: {
  label: string;
  items: Named[];
  value: Level | null;
  onChange: (value: Level | null) => void;
  levels?: Level[];
}) {
  return (
    <div className="skill-picker">
      <label>
        {label}
        <select
          aria-label={label}
          value={value?.id ?? ""}
          onChange={(e) =>
            onChange(
              e.target.value
                ? {
                    id: +e.target.value,
                    level:
                      levels?.find((x) => x.id === +e.target.value)?.level ??
                      value?.level ??
                      1,
                  }
                : null,
            )
          }
        >
          <option value="">不携带</option>
          {items.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} · {x.skill}
            </option>
          ))}
        </select>
      </label>
      {value && (
        <label className="level-field">
          技能等级
          <input
            aria-label={`${label}等级`}
            disabled={!!levels}
            type="number"
            min={1}
            max={100}
            value={value.level}
            onChange={(e) => onChange({ ...value, level: +e.target.value })}
          />
        </label>
      )}
      {value && (
        <p className="hint span-all">
          {items.find((x) => x.id === value.id)?.description}
        </p>
      )}
    </div>
  );
}
export default function LoadoutEditor({
  catalog,
  profession,
  value,
  onChange,
  relics = catalog.relics,
  inventory,
}: {
  catalog: Catalog;
  profession: number;
  value: Loadout;
  onChange: (v: Loadout) => void;
  relics?: Named[];
  inventory?: Profile;
}) {
  const change = <K extends keyof Loadout>(key: K, v: Loadout[K]) =>
    onChange({ ...value, [key]: v });
  return (
    <div className="loadout-editor">
      <div className="form-grid">
        <label>
          使用天赋
          <select
            aria-label="使用天赋"
            value={value.talentId}
            onChange={(e) =>
              onChange({
                ...value,
                talentId: +e.target.value,
                healing: +e.target.value === 201 ? "other" : "",
              })
            }
          >
            {catalog.talents
              .filter((x) => x.professionId === profession)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {x.tag}
                </option>
              ))}
          </select>
        </label>
        {value.talentId === 201 && (
          <label>
            观众治疗分类
            <select
              aria-label="观众治疗分类"
              value={value.healing}
              onChange={(e) => change("healing", e.target.value)}
            >
              <option value="other">非愈心观众</option>
              <option value="yuxin">愈心观众</option>
            </select>
          </label>
        )}
      </div>
      <h4>
        携带封印物 <small>最多 3 个 · 0 级最高</small>
      </h4>
      <div className="relic-choices">
        {relics.map((x) => {
          const picked = value.relics.find((r) => r.id === x.id);
          return (
            <div
              className={"relic-choice " + (picked ? "selected" : "")}
              key={x.id}
            >
              <label title={x.description}>
                <input
                  type="checkbox"
                  checked={!!picked}
                  disabled={!picked && value.relics.length >= 3}
                  onChange={(e) =>
                    change(
                      "relics",
                      e.target.checked
                        ? [...value.relics, { id: x.id, level: 3 }]
                        : value.relics.filter((r) => r.id !== x.id),
                    )
                  }
                />
                {x.name}
              </label>
              {picked && (
                <select
                  aria-label={`${x.name}携带等级`}
                  disabled={!!inventory}
                  value={picked.level}
                  onChange={(e) =>
                    change(
                      "relics",
                      value.relics.map((r) =>
                        r.id === x.id ? { ...r, level: +e.target.value } : r,
                      ),
                    )
                  }
                >
                  {[3, 2, 1, 0].map((l) => (
                    <option key={l} value={l}>
                      {l} 级
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
      <h4>携带技能</h4>
      <SkillPicker
        label="秘偶技能"
        levels={inventory?.puppets}
        items={catalog.puppets}
        value={value.puppet}
        onChange={(v) => change("puppet", v)}
      />
      <SkillPicker
        label="人脉技能"
        levels={inventory?.fellows}
        items={catalog.fellows}
        value={value.fellow}
        onChange={(v) => change("fellow", v)}
      />
    </div>
  );
}
export function LoadoutSummary({
  value,
  catalog,
}: {
  value: Loadout;
  catalog: Catalog;
}) {
  return (
    <div className="loadout-summary">
      <span>
        {nameOf(catalog.talents, value.talentId)}
        {value.healing === "yuxin"
          ? " · 愈心"
          : value.healing === "other"
            ? " · 非愈心"
            : ""}
      </span>
      <span>
        {value.relics
          ?.map((x) => `${nameOf(catalog.relics, x.id)} ${x.level}级`)
          .join(" / ") || "未携带封印物"}
      </span>
      <span>
        秘偶：
        {value.puppet
          ? `${nameOf(catalog.puppets, value.puppet.id)} Lv.${value.puppet.level}`
          : "未携带"}
      </span>
      <span>
        人脉：
        {value.fellow
          ? `${nameOf(catalog.fellows, value.fellow.id)} Lv.${value.fellow.level}`
          : "未携带"}
      </span>
    </div>
  );
}
