import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { beforeEach, afterAll, beforeAll, describe, expect, it } from "vitest";
import { createControlUiE2eArtifactDir } from "../test-helpers/control-ui-e2e-artifacts.ts";
import {
  canRunPlaywrightChromium,
  controlUiSessionUrl,
  installMockGateway,
  resolvePlaywrightChromiumExecutablePath,
  startControlUiE2eServer,
  type ControlUiE2eServer,
} from "../test-helpers/control-ui-e2e.ts";

const chromiumExecutablePath = resolvePlaywrightChromiumExecutablePath(chromium.executablePath());
const chromiumAvailable = canRunPlaywrightChromium(chromiumExecutablePath);
const allowMissingChromium = process.env.OPENCLAW_UI_E2E_ALLOW_MISSING_CHROMIUM === "1";
const describeControlUiE2e = chromiumAvailable || !allowMissingChromium ? describe : describe.skip;
const captureProof = process.env.OPENCLAW_CAPTURE_UI_PROOF === "1";
let artifactDir: string;
beforeEach(() => {
  if (captureProof) {
    artifactDir = createControlUiE2eArtifactDir("chat-markdown-table-interactions");
  }
});

const wideTable = `| Service | Owner | Region | Status | Version | Deploy | Incidents | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Gateway | Platform | eu-west-1 | Healthy | 2026.8.18 | Complete | 0 | Long operational note that keeps this column wide |`;

let browser: Browser;
let server: ControlUiE2eServer;

describeControlUiE2e("Control UI Markdown table interactions", () => {
  beforeAll(async () => {
    if (!chromiumAvailable) {
      throw new Error(`Playwright Chromium is unavailable at ${chromiumExecutablePath}`);
    }
    server = await startControlUiE2eServer(undefined, { source: true });
    browser = await chromium.launch({ executablePath: chromiumExecutablePath });
  });

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it.each(["chat", "assistant panel"])(
    "contains overflow, copies TSV, and restores focus after fullscreen in %s",
    async (surface) => {
      const context = await browser.newContext({
        colorScheme: "dark",
        locale: "en-US",
        serviceWorkers: "block",
        viewport: { height: 800, width: surface === "chat" ? 760 : 1280 },
        ...(captureProof ? { recordVideo: { dir: artifactDir } } : {}),
      });
      await context.grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: new URL(server.baseUrl).origin,
      });
      const page = await context.newPage();
      await installMockGateway(page, {
        ...(surface === "assistant panel"
          ? {
              featureMethods: [
                "chat.metadata",
                "chat.startup",
                "chat.history",
                "chat.send",
                "openclaw.chat",
                "openclaw.chat.history",
              ],
              methodResponses: {
                "openclaw.chat": {
                  sessionId: "table-proof",
                  reply: "Ready to help.",
                  action: "none",
                },
                "openclaw.chat.history": {
                  turns: [{ role: "assistant", text: wideTable, at: 1_700_000_101_000 }],
                },
              },
            }
          : {}),
        historyMessages: [
          {
            role: "assistant",
            content: [{ type: "text", text: wideTable }],
            timestamp: Date.now(),
            __openclaw: { id: "assistant-table", seq: 1 },
          },
        ],
      });

      try {
        await page.goto(`${server.baseUrl}chat`);
        if (surface === "assistant panel") {
          await page.locator(".sidebar-brand__search").click();
          await page.getByPlaceholder("Search chats and commands…").fill("Ask OpenClaw");
          await page.getByRole("option", { name: "Ask OpenClaw", exact: true }).click();
        }
        const bubble = page.locator(
          surface === "chat" ? '[data-entry-id="assistant-table"]' : ".custodian__messages",
        );
        const shell = bubble.locator(".markdown-table");
        const viewport = shell.locator(".markdown-table__viewport");
        const copy = shell.getByRole("button", { name: "Copy table" });
        const expand = shell.getByRole("button", { name: "Expand table" });
        await shell.waitFor({ state: "visible" });
        await expect.poll(() => shell.getAttribute("class")).toContain("can-scroll-right");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
          ),
        ).toBe(true);

        await viewport.evaluate((element) => {
          element.scrollLeft = Math.max(1, (element.scrollWidth - element.clientWidth) / 2);
          element.dispatchEvent(new Event("scroll"));
        });
        await expect.poll(() => shell.getAttribute("class")).toContain("can-scroll-left");
        await expect.poll(() => shell.getAttribute("class")).toContain("can-scroll-right");

        await copy.click();
        await expect
          .poll(() => page.evaluate(() => navigator.clipboard.readText()))
          .toContain("Service\tOwner\tRegion\tStatus\tVersion\tDeploy\tIncidents\tNotes");

        await expand.focus();
        const inlineTable = shell.locator("table");
        const inlineHeader = inlineTable.locator("th").first();
        const inlineCell = inlineTable.locator("td").first();
        await expand.click();
        const dialog = page.locator(".markdown-table-dialog");
        await dialog.waitFor({ state: "visible" });
        const fullscreenTable = dialog.locator("table");
        const fullscreenHeader = fullscreenTable.locator("th").first();
        const fullscreenCell = fullscreenTable.locator("td").first();
        expect(await fullscreenTable.textContent()).toContain("Gateway");
        const tableProperties = [
          "background-color",
          "border-collapse",
          "border-top-width",
          "box-shadow",
        ] as const;
        const cellProperties = [
          "background-color",
          "border-right-width",
          "border-bottom-color",
          "overflow-wrap",
          "white-space",
          "word-break",
        ] as const;
        const readStyles = async (locator: typeof inlineTable, properties: readonly string[]) =>
          locator.evaluate((element, propertyNames) => {
            const styles = getComputedStyle(element);
            return Object.fromEntries(
              propertyNames.map((property) => {
                const value = styles.getPropertyValue(property);
                if (!value) {
                  throw new Error(`Missing computed value for ${property}`);
                }
                return [property, value];
              }),
            );
          }, properties);
        expect(await readStyles(fullscreenTable, tableProperties)).toEqual(
          await readStyles(inlineTable, tableProperties),
        );
        expect(await readStyles(fullscreenHeader, cellProperties)).toEqual(
          await readStyles(inlineHeader, cellProperties),
        );
        expect(await readStyles(fullscreenCell, cellProperties)).toEqual(
          await readStyles(inlineCell, cellProperties),
        );
        if (captureProof) {
          await page.screenshot({
            animations: "disabled",
            path: path.join(artifactDir, "dark-fullscreen.png"),
          });
        }

        const dialogBounds = await dialog.boundingBox();
        if (!dialogBounds) {
          throw new Error("Expanded table dialog has no layout bounds");
        }
        await page.mouse.click(
          Math.max(1, dialogBounds.x - 8),
          dialogBounds.y + Math.min(8, dialogBounds.height / 2),
        );
        await expect.poll(() => dialog.count()).toBe(0);
        await expect
          .poll(() => expand.evaluate((element) => element === document.activeElement))
          .toBe(true);

        await expand.click();
        await dialog.waitFor({ state: "visible" });
        await page.keyboard.press("Escape");
        await expect.poll(() => dialog.count()).toBe(0);
        await expect
          .poll(() => expand.evaluate((element) => element === document.activeElement))
          .toBe(true);
      } finally {
        if (captureProof) {
          await page.screenshot({ path: path.join(artifactDir, "final-state.png") });
        }
        await context.close();
      }
    },
  );

  it.each([
    { link: "file", activation: "click" },
    { link: "session", activation: "Space" },
  ])("opens a $link from an expanded table with $activation", async ({ link, activation }) => {
    const sourceKey = "agent:main:dashboard:table-source";
    const targetKey = "agent:main:dashboard:table-target";
    const context = await browser.newContext({
      colorScheme: "dark",
      locale: "en-US",
      serviceWorkers: "block",
      viewport: { height: 900, width: 1280 },
      ...(captureProof
        ? { recordVideo: { dir: artifactDir, size: { height: 900, width: 1280 } } }
        : {}),
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const gateway = await installMockGateway(page, {
      sessionKey: sourceKey,
      sessions: [
        { key: sourceKey, label: "Table links" },
        { key: targetKey, label: "Linked task" },
      ],
      sessionTranscripts: {
        [sourceKey]: {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: `| File | Task |
| --- | --- |
| \`src/ready.ts:2\` | ${targetKey} |`,
                },
              ],
              timestamp: 1,
              __openclaw: { id: "table-links", seq: 1 },
            },
          ],
        },
        [targetKey]: {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "Linked task reached." }],
              timestamp: 2,
              __openclaw: { id: "linked-task", seq: 1 },
            },
          ],
        },
      },
      methodResponses: {
        "sessions.files.get": {
          root: "/workspace",
          sessionKey: sourceKey,
          file: {
            content: "// Workspace file\nexport const ready = true;\n",
            kind: "read",
            missing: false,
            name: "ready.ts",
            path: "src/ready.ts",
            workspacePath: "src/ready.ts",
          },
        },
      },
    });
    const selector =
      link === "file" ? 'a[data-file-path="src/ready.ts"]' : `a[data-session-key="${targetKey}"]`;
    const activate = async (scope: ReturnType<typeof page.locator>) => {
      const anchor = scope.locator(selector);
      if (activation === "click") {
        await anchor.click();
      } else {
        await anchor.press(activation);
      }
    };
    const expectDestination = async (fileRequestCount: number) => {
      if (link === "file") {
        await expect
          .poll(async () => (await gateway.getRequests("sessions.files.get")).length)
          .toBe(fileRequestCount);
        await expect
          .poll(() => page.locator(".sidebar-file-view").textContent())
          .toContain("export const ready = true;");
      } else {
        await expect.poll(() => page.url()).toBe(controlUiSessionUrl(server.baseUrl, targetKey));
        await page.locator('[data-entry-id="linked-task"]').waitFor({ state: "visible" });
      }
    };
    try {
      await page.goto(controlUiSessionUrl(server.baseUrl, sourceKey));
      const shell = page.locator('[data-entry-id="table-links"] .markdown-table');
      await activate(shell);
      await expectDestination(1);
      if (captureProof) {
        await page.screenshot({ path: path.join(artifactDir, "inline-control.png") });
      }
      await page.goto(controlUiSessionUrl(server.baseUrl, sourceKey));
      await shell.getByRole("button", { name: "Expand table" }).click();
      const dialog = page.locator(".markdown-table-dialog");
      await dialog.waitFor({ state: "visible" });
      if (captureProof) {
        await page.screenshot({ path: path.join(artifactDir, "expanded-before-action.png") });
      }
      const before = (await gateway.getRequests("sessions.files.get")).length;
      await activate(dialog);
      await expectDestination(before + 1);
      await dialog.waitFor({ state: "detached" });
    } finally {
      if (captureProof) {
        await page.screenshot({ path: path.join(artifactDir, "expanded-after-action.png") });
        fs.writeFileSync(
          path.join(artifactDir, "actions.json"),
          JSON.stringify(
            {
              link,
              activation,
              url: page.url(),
              requests: (await gateway.getRequests()).filter((request) =>
                ["sessions.files.get", "chat.startup", "chat.history"].includes(request.method),
              ),
              expandedTableVisible: await page
                .getByRole("dialog", { name: "Expanded table" })
                .isVisible(),
            },
            null,
            2,
          ) + "\n",
        );
      }
      await context.close();
    }
  });
});
