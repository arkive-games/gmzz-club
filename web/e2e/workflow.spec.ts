import { test, expect } from "@playwright/test";
// @ts-expect-error The fixture helper is executable ESM shared with the demo CLI.
import { seedDemo } from "../../scripts/seed-demo.mjs";

test("club dashboard, profile defaults, lineup editing, approval and mobile viewing", async ({
  page,
  browser,
}) => {
  const demo = await seedDemo(process.env.APP_URL);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByLabel("用户名", { exact: true }).fill(demo.owner.username);
  await page.getByLabel("密码", { exact: true }).fill(demo.owner.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: /塔罗会/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "集结非凡，奔赴未知。" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  // Create a profile in the UI and choose an owned default skill.
  await page.getByRole("button", { name: "我的角色", exact: true }).click();
  await page.getByRole("button", { name: "创建角色", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("角色名称").fill("浏览器验证角色");
  await dialog.getByLabel("非凡评分").fill("206789");
  await dialog.getByLabel("丧钟等级", { exact: true }).selectOption("0");
  await dialog.getByLabel("添加秘偶技能").selectOption({ index: 1 });
  await dialog
    .getByRole("button", { name: "添加", exact: true })
    .first()
    .click();
  await dialog.getByLabel("子爵夫人技能等级", { exact: true }).fill("37");
  await dialog.getByRole("button", { name: "默认出战配置" }).click();
  await dialog.getByRole("checkbox", { name: "丧钟", exact: true }).check();
  await dialog
    .getByLabel("秘偶技能", { exact: true })
    .selectOption({ index: 1 });
  await expect(dialog.getByLabel("秘偶技能等级", { exact: true })).toHaveValue(
    "37",
  );
  await dialog.getByRole("button", { name: "保存角色", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "浏览器验证角色", exact: true }),
  ).toBeVisible();
  // Bind the new profile, inspect the fixed five-by-six team grid and save config.
  await page.getByRole("button", { name: "成员管理", exact: true }).click();
  await page
    .getByRole("combobox", { name: "绑定角色" })
    .selectOption({ label: "浏览器验证角色" });
  await expect(page.getByRole("status")).toContainText("角色已绑定");
  await page.getByRole("button", { name: "活动与团队", exact: true }).click();
  await page.getByRole("button", { name: "周六集结 · 非凡者远征" }).click();
  await expect(page.locator(".team-grid .team-slot")).toHaveCount(30);
  await expect(page.locator(".team-grid .squad")).toHaveCount(5);
  await page.getByRole("button", { name: "关闭提示" }).click();
  await page.screenshot({
    path: "test-results/lineup-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /第1小队第1位/ }).click();
  await page.getByLabel("使用天赋").selectOption("302");
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /第1小队第1位/ }),
  ).toContainText("灵性");
  // Arrange an unregistered but bound profile; it starts with saved defaults.
  await page.getByRole("button", { name: /第1小队第6位/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /浏览器验证角色/ })
    .click();
  await expect(
    page.getByRole("button", { name: /第1小队第6位/ }),
  ).toContainText("丧钟");
  await page.getByRole("button", { name: /第1小队第6位/ }).click();
  await page.getByRole("button", { name: "移出团队", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /第1小队第6位/ }),
  ).toContainText("安排角色");
  // A new member applies; the owner approves through the UI.
  const applicant = await browser.newContext({
    baseURL: process.env.APP_URL ?? "http://127.0.0.1:19080",
  });
  const applicantPage = await applicant.newPage();
  await applicantPage.goto("/");
  await applicantPage
    .getByRole("button", { name: "注册账号", exact: true })
    .click();
  const applicantName = "applicant_" + Date.now().toString(36);
  await applicantPage.getByLabel("用户名", { exact: true }).fill(applicantName);
  await applicantPage.getByLabel("昵称", { exact: true }).fill("待审核伙伴");
  await applicantPage
    .getByLabel("密码", { exact: true })
    .fill("Browser-test-2026");
  await applicantPage
    .getByRole("button", { name: "创建账号", exact: true })
    .click();
  await applicantPage
    .getByRole("button", { name: "发现俱乐部", exact: true })
    .first()
    .click();
  const clubCard = applicantPage.locator(".club-card");
  const ownerState = await page.request.get("/api/state");
  const club = (await ownerState.json()).clubs.find(
    (c: { id: string }) => c.id === demo.club,
  );
  await clubCard
    .filter({
      has: applicantPage.getByRole("heading", { name: club.name, exact: true }),
    })
    .getByRole("button", { name: "申请加入", exact: true })
    .click();
  await expect(applicantPage.getByRole("status")).toContainText("申请已提交");
  await page.getByRole("button", { name: "刷新数据", exact: true }).click();
  await page.getByRole("button", { name: "成员管理", exact: true }).click();
  await page
    .locator(".member-row")
    .filter({ hasText: "待审核伙伴" })
    .getByRole("button", { name: "通过申请" })
    .click();
  await expect(page.getByRole("status")).toContainText("已批准入会");
  // Ordinary members have a viewing grid with no administrative candidate editor.
  await applicantPage
    .getByRole("button", { name: "刷新数据", exact: true })
    .click();
  await applicantPage
    .getByRole("button", { name: "活动与团队", exact: true })
    .click();
  await applicantPage
    .getByRole("button", { name: "周六集结 · 非凡者远征" })
    .click();
  await expect(applicantPage.locator(".team-slot")).toHaveCount(30);
  await expect(applicantPage.locator(".candidate-panel")).toHaveCount(0);
  await expect(
    applicantPage.locator('.team-slot[draggable="true"]'),
  ).toHaveCount(0);
  await expect(
    applicantPage.getByRole("button", { name: "增加团队", exact: true }),
  ).toHaveCount(0);
  await expect(
    applicantPage.getByRole("button", { name: "删除当前团队", exact: true }),
  ).toHaveCount(0);
  await applicant.close();
  // Platform administration creates a separate club without enrolling its creator.
  const platformContext = await browser.newContext({
    baseURL: process.env.APP_URL ?? "http://127.0.0.1:19080",
  });
  const platformPage = await platformContext.newPage();
  await platformPage.goto("/");
  await platformPage
    .getByLabel("用户名", { exact: true })
    .fill(demo.platform.username);
  await platformPage
    .getByLabel("密码", { exact: true })
    .fill(demo.platform.password);
  await platformPage.getByRole("button", { name: "登录", exact: true }).click();
  await platformPage
    .getByRole("button", { name: "俱乐部管理", exact: true })
    .click();
  await platformPage
    .getByRole("button", { name: "创建俱乐部", exact: true })
    .click();
  const secondClub = "浏览器创建俱乐部 " + Date.now().toString(36);
  await platformPage.getByLabel("俱乐部名称").fill(secondClub);
  await platformPage.getByLabel("查找首位会长").fill(demo.owner.username);
  const ownerSelect = platformPage.getByLabel("指定首位会长");
  await expect(ownerSelect.locator("option")).toHaveCount(2);
  await ownerSelect.selectOption({ index: 1 });
  await platformPage
    .getByRole("dialog")
    .getByRole("button", { name: "创建俱乐部", exact: true })
    .click();
  await expect(platformPage.getByRole("dialog")).toHaveCount(0);
  const platformState = await (
    await platformPage.request.get("/api/state")
  ).json();
  expect(
    platformState.clubs.find((c: { name: string }) => c.name === secondClub)
      .role,
  ).toBeNull();
  await platformContext.close();
  await page.getByRole("button", { name: "刷新数据" }).click();
  await expect(page.getByLabel("切换俱乐部").locator("option")).toHaveCount(2);
  await page.getByLabel("切换俱乐部").selectOption({ label: secondClub });
  await expect(
    page.getByRole("heading", { name: "成员管理", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "活动与团队", exact: true }).click();
  await page.getByRole("button", { name: "创建活动", exact: true }).click();
  await page.getByLabel("活动名称").fill("浏览器创建的活动");
  await expect(page.getByLabel("团队数量")).toHaveValue("3");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "创建活动", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "浏览器创建的活动" }),
  ).toBeVisible();
  await page.getByLabel("切换俱乐部").selectOption(demo.club);
  // Responsive navigation and dark mode.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("button", { name: "俱乐部概览", exact: true }).click();
  await expect(page.getByRole("heading", { name: /塔罗会/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "关闭提示" }).click();
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "切换主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "test-results/dashboard-dark.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
