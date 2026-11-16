import { test, expect, type Locator } from "@playwright/test";
// @ts-expect-error Executable fixture helper shared with the demo CLI.
import { seedDemo } from "../../scripts/seed-demo.mjs";

test("drag positions and candidates, filter pathways, and manage teams", async ({
  page,
}) => {
  const demo = await seedDemo(process.env.APP_URL);
  await page.setViewportSize({ width: 1600, height: 1700 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("用户名", { exact: true }).fill(demo.owner.username);
  await page.getByLabel("密码", { exact: true }).fill(demo.owner.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("button", { name: "活动与团队", exact: true }).click();
  await page.getByRole("button", { name: "周六集结 · 非凡者远征" }).click();
  const slot = (squad: number, row: number) =>
    page.getByRole("button", { name: new RegExp(`第${squad}小队第${row}位`) });
  const tab = (number: number) =>
    page.getByRole("button", {
      name: `团队 ${String(number).padStart(2, "0")}`,
      exact: true,
    });
  const snapshot = async () =>
    await (await page.request.get("/api/clubs/" + demo.club)).json();
  const original = await snapshot();
  const first = original.slots.find(
    (s: { event_id: string; team: number; position: number }) =>
      s.event_id === demo.events[0] && s.team === 1 && s.position === 0,
  );
  const second = original.slots.find(
    (s: { event_id: string; team: number; position: number }) =>
      s.event_id === demo.events[0] && s.team === 1 && s.position === 6,
  );
  async function dragTo(source: Locator, target: Locator) {
    const saved = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/events/${demo.events[0]}/lineup`) &&
        r.request().method() === "PUT",
    );
    await source.dragTo(target);
    expect((await saved).status()).toBe(200);
  }
  await expect(tab(3)).toBeVisible();
  await dragTo(slot(1, 1), slot(1, 6));
  await expect(slot(1, 6)).toContainText(first.config.name);
  await expect(slot(1, 1)).toContainText("安排角色");
  await dragTo(slot(1, 6), slot(2, 1));
  await expect(slot(2, 1)).toContainText(first.config.name);
  await expect(slot(1, 6)).toContainText(second.config.name);
  let current = await snapshot();
  expect(
    current.slots.find(
      (s: { character_id: string; event_id: string }) =>
        s.character_id === first.character_id && s.event_id === demo.events[0],
    ).config,
  ).toEqual(first.config);
  // Combine pathway tags, search and registration in the candidate list and picker.
  const pool = page.locator(".candidate-panel");
  await pool.getByRole("button", { name: "愚者", exact: true }).click();
  await expect(pool.locator(".candidate")).toHaveCount(1);
  await expect(pool.locator(".candidate")).toContainText("银白骑士");
  await pool.getByPlaceholder("搜索角色、途径或成员").fill("不存在");
  await expect(pool.locator(".candidate")).toHaveCount(0);
  await pool.getByPlaceholder("搜索角色、途径或成员").fill("");
  await pool.getByRole("checkbox", { name: "仅显示已报名" }).check();
  await pool.getByRole("button", { name: "隐者", exact: true }).click();
  await expect(pool.locator(".candidate")).toHaveCount(0);
  await pool.getByRole("checkbox", { name: "仅显示已报名" }).uncheck();
  await expect(pool.locator(".candidate")).toContainText("黎明之光");
  await pool.getByRole("button", { name: "全部途径", exact: true }).click();
  await slot(1, 1).click();
  const picker = page.getByRole("dialog");
  await picker.getByRole("button", { name: "空想家", exact: true }).click();
  await expect(picker.locator(".picker-row")).toHaveCount(1);
  await expect(picker.locator(".picker-row")).toContainText("信使小姐");
  await picker.getByRole("button", { name: "关闭", exact: true }).click();
  await pool.getByRole("button", { name: "全部途径", exact: true }).click();
  // A pool character uses its default loadout and displaces occupied characters safely.
  await dragTo(pool.getByRole("button", { name: /银白骑士/ }), slot(1, 1));
  await expect(slot(1, 1)).toContainText("银白骑士");
  const added = (await snapshot()).slots.find(
    (s: { event_id: string; team: number; position: number }) =>
      s.event_id === demo.events[0] && s.team === 1 && s.position === 0,
  );
  const character = original.characters.find(
    (c: { name: string }) => c.name === "银白骑士",
  );
  expect(added.config.puppet).toEqual(character.profile.default.puppet);
  await dragTo(pool.getByRole("button", { name: /信使小姐/ }), slot(1, 1));
  await expect(slot(1, 1)).toContainText("信使小姐");
  await expect(pool.getByRole("button", { name: /银白骑士/ })).toBeVisible();
  // Keep a real native drag active while hovering a team tab, then drop in that team.
  const from = await slot(2, 1).boundingBox();
  const team2 = await tab(2).boundingBox();
  await page.mouse.move(from!.x + 20, from!.y + 20);
  await page.mouse.down();
  await page.mouse.move(from!.x + 35, from!.y + 35, { steps: 5 });
  await page.mouse.move(team2!.x + 10, team2!.y + 10, { steps: 12 });
  await expect(tab(2)).toHaveClass("active");
  const to = await slot(1, 1).boundingBox();
  const moved = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/events/${demo.events[0]}/lineup`) &&
      r.request().method() === "PUT",
  );
  await page.mouse.move(to!.x + 30, to!.y + 30, { steps: 10 });
  await page.mouse.up();
  expect((await moved).status()).toBe(200);
  await expect(slot(1, 1)).toContainText(first.config.name);
  // Adding and deleting a team changes the shared revision and preserves signups.
  await page.getByRole("button", { name: "增加团队", exact: true }).click();
  await expect(tab(4)).toHaveClass("active");
  await dragTo(pool.getByRole("button", { name: /银白骑士/ }), slot(1, 1));
  await expect(slot(1, 1)).toContainText("银白骑士");
  const signupCount = (await snapshot()).signups.length;
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "删除当前团队", exact: true }).click();
  await expect(tab(4)).toHaveCount(0);
  await expect(pool.getByRole("button", { name: /银白骑士/ })).toBeVisible();
  expect((await snapshot()).signups.length).toBe(signupCount);
  await tab(1).click();
  await page.reload();
  await page.getByRole("button", { name: "活动与团队", exact: true }).click();
  await page.getByRole("button", { name: "周六集结 · 非凡者远征" }).click();
  await tab(2).click();
  await expect(slot(1, 1)).toContainText(first.config.name);
  expect(errors).toEqual([]);
});
