import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export async function seedDemo(base = "http://127.0.0.1:19080") {
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw new Error("Demo fixtures are restricted to a local server");
  if (!process.env.DATABASE_URL)
    throw new Error(
      "Set DATABASE_URL to the same local database as the application",
    );
  const suffix = Date.now().toString(36);
  const password = "Demo-club-2026";
  async function request(path, method = "GET", body, cookie) {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await r.json();
    if (!r.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json)}`);
    return { json, cookie: r.headers.get("set-cookie")?.split(";")[0] };
  }
  async function user(prefix, displayName) {
    const username = `${prefix}_${suffix}`;
    const { json, cookie } = await request("/auth/register", "POST", {
      username,
      displayName,
      password,
    });
    return { id: json.id, username, password, cookie };
  }
  const platform = await user("platform", "平台管理员");
  const owner = await user("owner", "克莱恩");
  const member = await user("member", "奥黛丽");
  execFileSync("go", ["run", ".", "promote", platform.username], {
    cwd: new URL("..", import.meta.url),
    env: process.env,
    stdio: "pipe",
    windowsHide: true,
  });
  const catalog = (await request("/catalog")).json;
  const club = (
    await request(
      "/clubs",
      "POST",
      {
        name: `塔罗会 · ${suffix}`,
        description:
          "在灰雾之上相聚，与值得信赖的伙伴一起，探索未知、并肩前行。",
        ownerId: owner.id,
      },
      platform.cookie,
    )
  ).json.id;
  await request(
    `/clubs/${club}/applications`,
    "POST",
    undefined,
    member.cookie,
  );
  await request(
    `/clubs/${club}/applications/${member.id}`,
    "PUT",
    { accept: true },
    owner.cookie,
  );
  const names = [
    "愚者先生",
    "正义小姐",
    "倒吊人",
    "星星",
    "月亮",
    "审判",
    "魔术师",
    "太阳",
    "隐者",
    "世界",
    "红手套",
    "旅途中的人",
    "银白骑士",
    "信使小姐",
    "命运之轮",
    "黎明之光",
    "黑夜眷者",
    "塔罗来客",
  ];
  const professions = [1200003, 1200002, 1200001, 1200007, 1200006, 1200005];
  const characters = [];
  for (let i = 0; i < names.length; i++) {
    const account = i % 3 === 0 ? member : owner;
    const profession = professions[i % professions.length];
    const talent = catalog.talents.find((t) => t.professionId === profession);
    const relics = catalog.relics
      .slice(i % 4, (i % 4) + 3)
      .map((x) => ({ id: x.id, level: i % 3 }));
    const puppet = {
      id: catalog.puppets[i % catalog.puppets.length].id,
      level: 35 + (i % 5),
    };
    const fellow = {
      id: catalog.fellows[i % catalog.fellows.length].id,
      level: 35 + (i % 5),
    };
    const config = {
      talentId: talent.id,
      healing: talent.id === 201 ? (i % 2 ? "yuxin" : "other") : "",
      relics,
      puppet,
      fellow,
    };
    const c = (
      await request(
        "/characters",
        "POST",
        {
          name: names[i],
          professionId: profession,
          score: 218500 - i * 3409,
          profile: {
            relics,
            puppets: [puppet],
            fellows: [fellow],
            default: config,
          },
        },
        account.cookie,
      )
    ).json;
    await request(
      `/clubs/${club}/characters/${c.id}`,
      "PUT",
      { bound: true },
      account.cookie,
    );
    characters.push({ id: c.id, account, config });
  }
  const events = [];
  for (const [i, title] of [
    "周六集结 · 非凡者远征",
    "灰雾行动 · 精英挑战",
  ].entries()) {
    const event = (
      await request(
        `/clubs/${club}/events`,
        "POST",
        {
          title,
          description: i
            ? "精英小队集结，请提前准备好封印物与常用技能。"
            : "晚间团队活动，提前 10 分钟集合。请确认自己的出战配置，和伙伴一起出发。",
          startsAt: new Date(
            Date.now() + (48 + i * 24) * 3600000,
          ).toISOString(),
          deadline: new Date(
            Date.now() + (24 + i * 24) * 3600000,
          ).toISOString(),
          teamCount: 3,
        },
        owner.cookie,
      )
    ).json.id;
    for (const c of characters.slice(0, i ? 8 : 15))
      await request(
        `/events/${event}/signups/${c.id}`,
        "PUT",
        undefined,
        c.account.cookie,
      );
    const slots = characters.slice(0, i ? 6 : 12).map((c, index) => ({
      team: 1,
      position: (index % 5) * 6 + Math.floor(index / 5),
      character_id: c.id,
      config: c.config,
    }));
    await request(
      `/events/${event}/lineup`,
      "PUT",
      { revision: 0, slots },
      owner.cookie,
    );
    events.push(event);
  }
  return {
    club,
    events,
    owner: { username: owner.username, password },
    member: { username: member.username, password },
    platform: { username: platform.username, password },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  console.log(JSON.stringify(await seedDemo(process.env.APP_URL), null, 2));
}
