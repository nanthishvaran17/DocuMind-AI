"use client";

import { FileText, Terminal } from "lucide-react";
import {
  Badge,
  Bar,
  Button,
  Check,
  Collapse,
  Count,
  Field,
  Kbd,
  Meter,
  Popover,
  Row,
  Stage,
  States,
  Text,
  Window,
  type Act,
} from "./kit";
import "./documind-look.css";
import "./DocuMindHeroDemo.css";

type HeroState = {
  paletteOpen: boolean;
  query: string;
  running: boolean;
  compressed: boolean;
  kb: number;
  savedPct: number;
};

const INITIAL: HeroState = {
  paletteOpen: false,
  query: "",
  running: false,
  compressed: false,
  kb: 1420,
  savedPct: 0,
};

const POSTER: HeroState = {
  paletteOpen: false,
  query: "compress under 200 kb",
  running: false,
  compressed: true,
  kb: 184,
  savedPct: 87,
};

const COMMAND_TEXT = "compress under 200 kb";
const REST = { wide: { at: "cmd-trigger", x: 0.72, y: 0.5 }, compact: { at: "cmd-trigger", x: 0.55, y: 0.5 } };

async function heroScript(a: Act<HeroState>) {
  await a.wait(700);

  // 1. Open One-Box Command bar via Cmd+K
  await a.move("cmd-trigger");
  await a.wait(220);
  await a.click();
  await a.key("cmd+k");
  await a.set({ paletteOpen: true, query: "" });
  await a.wait(380);

  // 2. Type natural-language portal target
  await a.move({ at: "cmd-field", x: 0.35, y: 0.5 });
  await a.type("query", COMMAND_TEXT, { interval: 42 });
  await a.wait(350);

  // 3. Approve and execute plan
  await a.move("run-cmd");
  await a.wait(220);
  await a.click();
  await a.set({ paletteOpen: false, running: true });
  await a.wait(520);

  // 4. Immutable v2 lands, meter fills, KB rolls down to 184 KB
  await a.set({
    running: false,
    compressed: true,
    kb: 184,
    savedPct: 87,
  });
  await a.move({ at: "receipt", x: 0.86, y: 0.25 });
  await a.wait(2600);

  // 5. Caused reset via Undo (Cmd+Z) to keep the loop seamless
  await a.key("cmd+z");
  await a.set({
    compressed: false,
    kb: 1420,
    savedPct: 0,
  });
  await a.wait(500);
  await a.snap({ ...INITIAL });
  await a.move(REST);
  await a.wait(600);
}

export function DocuMindHeroDemo() {
  return (
    <div className="look-documind dmh-wrap">
      <Stage
        width={984}
        height={420}
        compact={{ below: 640, width: 358, height: 390 }}
        initial={INITIAL}
        poster={POSTER}
        script={heroScript}
        greys="cool"
        cursor={{ at: REST, style: "real", ripple: true }}
        className="dmh-stage"
      >
        {(s, _rect, layout) => {
          const compact = layout === "compact";
          return (
            <>
              <Window
                url="app.documind.ai/workspace"
                className="dmh-window"
                sidebarWidth={compact ? undefined : 188}
                sidebar={
                  compact ? undefined : (
                    <div className="dmh-sidebar">
                      <div className="dmh-brand">
                        <FileText size={14} strokeWidth={1.9} />
                        <Text className="dmh-brand__name">DocuMind AI</Text>
                      </div>
                      <div className="dmh-nav">
                        <div className="dmh-nav__item dmh-nav__item--active">
                          <Bar w={12} h={12} r={3} tone={5} />
                          <Text className="dmh-nav__label">Workspace</Text>
                        </div>
                        {[68, 54, 62].map((w, i) => (
                          <div key={i} className="dmh-nav__item">
                            <Bar w={12} h={12} r={3} tone={2} />
                            <Bar w={w} h={7} tone={2} />
                          </div>
                        ))}
                      </div>
                      <div className="dmh-sidebar__foot">
                        <Bar w={84} h={6} tone={3} />
                        <Bar w={118} h={5} tone={2} />
                      </div>
                    </div>
                  )
                }
              >
                <div className="dmh-body">
                  {/* Top workspace bar */}
                  <div className="dmh-topbar">
                    <div className="dmh-doc">
                      <FileText size={14} strokeWidth={1.8} className="dmh-doc__icon" />
                      <Text className="dmh-doc__name">semester_5_assignment.pdf</Text>
                    </div>
                    <button
                      type="button"
                      data-target="cmd-trigger"
                      data-cursor="pointer"
                      data-open={s.paletteOpen || undefined}
                      className="dmh-cmd-btn"
                    >
                      <Terminal size={12} strokeWidth={1.8} />
                      <span>Command</span>
                      {!compact && <Kbd keys={["⌘", "K"]} />}
                    </button>
                  </div>

                  {/* Version Timeline */}
                  <div className="dmh-section">
                    <Text className="dmh-section__label">Version Timeline</Text>
                    <div className="dmh-timeline">
                      <Collapse open={s.compressed} reveal="drop">
                        <div className="dmh-version-slot">
                          <Row
                            pad={0}
                            selected
                            className="dmh-row dmh-row--v2"
                            lead={
                              <span className="dmh-ver-tag dmh-ver-tag--accent">v2</span>
                            }
                            title={<Text className="dmh-row__title">Compressed</Text>}
                            subtitle={<Text className="dmh-row__sub">184 KB • 5 pages</Text>}
                          >
                            <Badge tone="accent">Active</Badge>
                          </Row>
                        </div>
                      </Collapse>

                      <Row
                        pad={0}
                        selected={!s.compressed}
                        className="dmh-row"
                        lead={<span className="dmh-ver-tag">v1</span>}
                        title={<Text className="dmh-row__title">Original</Text>}
                        subtitle={<Text className="dmh-row__sub">1.42 MB • Protected</Text>}
                      >
                        <Badge tone="neutral">Immutable</Badge>
                      </Row>

                      {/* Quiet filler rows cropped cleanly by bottom bleed */}
                      {[
                        [96, 62],
                        [82, 54],
                        [104, 58],
                      ].map(([w1, w2], idx) => (
                        <Row
                          key={idx}
                          pad={0}
                          className="dmh-row dmh-row--filler"
                          lead={<Bar w={22} h={22} r={6} tone={2} />}
                          title={<Bar w={w1} h={8} tone={3} />}
                          subtitle={<Bar w={w2} h={6} tone={2} />}
                        >
                          <Bar w={46} h={18} r={9} tone={1} />
                        </Row>
                      ))}
                    </div>
                  </div>
                </div>
              </Window>

              {/* One-Box Command Popover */}
              <Popover
                show={s.paletteOpen}
                origin="top center"
                className="dmh-popover"
              >
                <div className="dmh-popover__head">
                  <Terminal size={13} strokeWidth={1.8} />
                  <Text className="dmh-popover__title">One-Box Command</Text>
                </div>
                <Field
                  data-target="cmd-field"
                  value={s.query}
                  placeholder="Describe edit or target KB..."
                  focused={s.paletteOpen}
                  className="dmh-popover__field"
                />
                <div className="dmh-popover__foot">
                  <Text className="dmh-popover__hint">Creates v2 • keeps v1 safe</Text>
                  <Button
                    data-target="run-cmd"
                    variant="primary"
                    size="small"
                    icon={<Terminal size={12} />}
                  >
                    Run plan
                  </Button>
                </div>
              </Popover>

              {/* Satellite Receipt Card straddling bottom-right edge */}
              <div className="dmh-receipt" data-target="receipt">
                <div className="dmh-receipt__head">
                  <Check pending={s.running} on={s.compressed} size={18} />
                  <States
                    value={s.compressed ? "done" : s.running ? "run" : "idle"}
                    states={{
                      idle: <Text className="dmh-receipt__status">Portal target &lt; 200 KB</Text>,
                      run: <Text className="dmh-receipt__status">Optimizing streams…</Text>,
                      done: <Text className="dmh-receipt__status dmh-receipt__status--ok">Target &lt; 200 KB met</Text>,
                    }}
                  />
                </div>
                <div className="dmh-receipt__metric">
                  <Count value={s.kb} format={(n) => `${Math.round(n)} KB`} className="dmh-receipt__kb" />
                  <Badge tone={s.compressed ? "success" : "neutral"}>
                    {s.compressed ? "-87%" : "1.42 MB"}
                  </Badge>
                </div>
                <Meter value={s.savedPct} tone={s.compressed ? "success" : "accent"} />
              </div>
            </>
          );
        }}
      </Stage>
    </div>
  );
}

