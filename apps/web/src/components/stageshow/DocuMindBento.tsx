"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FileCheck2, Lock, ShieldCheck, Terminal } from "lucide-react";
import {
  Badge,
  Bar,
  Card,
  Check,
  Connector,
  Count,
  Meter,
  Row,
  Segmented,
  Stage,
  States,
  Text,
  Window,
  type Act,
} from "./kit";
import "./documind-look.css";
import "./DocuMindBento.css";

const STEP = 110;
const LEAD = 380;

type Beat = { on: boolean };
const BEFORE: Beat = { on: false };
const AFTER: Beat = { on: true };

const beat = (idx: number) => async (a: Act<Beat>) => {
  await a.wait(LEAD + idx * STEP);
  await a.set({ on: true });
};

function usePictureWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const next = Math.round(el.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width] as const;
}

function Tile({
  area,
  lead,
  body,
  picture,
  dark,
}: {
  area: string;
  lead: string;
  body: string;
  picture?: ReactNode;
  dark?: boolean;
}) {
  return (
    <section className={`dmb-tile dmb-tile--${area}`} data-dark={dark || undefined}>
      <p className="dmb-copy">
        <strong>{lead}</strong> {body}
      </p>
      {picture}
    </section>
  );
}

const COMPRESS_ROWS = [
  { real: true },
  { name: 92, sub: 56, pill: 54 },
  { name: 76, sub: 48, pill: 48 },
];

function HeroCompressionPicture() {
  const [ref, width] = usePictureWidth();
  const compact = width < 480;
  return (
    <div ref={ref} className="dmb-picture dmb-picture--full look-documind">
      <Stage
        width={width}
        height={238}
        initial={BEFORE}
        poster={AFTER}
        play="once"
        script={beat(0)}
        greys="cool"
        className="dmb-stage"
      >
        {(s) => (
          <Window
            title="Compress PDF"
            className="dmb-hero-win"
            style={{
              left: compact ? 20 : 28,
              width: Math.max(300, width - (compact ? 40 : 56)),
              height: 248,
            }}
          >
            <div className="dmb-hero-list">
              {COMPRESS_ROWS.map((row, idx) =>
                row.real ? (
                  <div key={idx} className="dmb-hero-item">
                    <Row
                      pad={0}
                      selected={s.on}
                      className="dmb-hero-row"
                      lead={
                        <span className="dmb-file-pill">PDF</span>
                      }
                      title={<Text className="dmb-row-name">portal_application.pdf</Text>}
                      subtitle={<Text className="dmb-row-sub">1.42 MB original • 5 pages</Text>}
                    >
                      <States
                        value={s.on ? "done" : "pending"}
                        align="end"
                        states={{
                          pending: <Badge tone="warning">Optimizing</Badge>,
                          done: <Badge tone="success">184 KB</Badge>,
                        }}
                      />
                    </Row>
                    <div className="dmb-hero-meter">
                      <Meter value={s.on ? 87 : 28} tone={s.on ? "success" : "accent"} />
                    </div>
                  </div>
                ) : (
                  <Row
                    key={idx}
                    pad={0}
                    className="dmb-hero-row dmb-hero-row--filler"
                    lead={<Bar w={26} h={20} r={5} tone={2} />}
                    title={<Bar w={row.name!} h={7} tone={3} />}
                    subtitle={<Bar w={row.sub!} h={5} tone={2} />}
                  >
                    <Bar w={row.pill!} h={18} r={9} tone={1} />
                  </Row>
                )
              )}
            </div>
          </Window>
        )}
      </Stage>
    </div>
  );
}

function ZeroOverwriteStatPicture() {
  return (
    <div className="dmb-picture dmb-picture--full look-documind">
      <Stage
        width={320}
        height={224}
        initial={BEFORE}
        poster={AFTER}
        play="once"
        script={beat(1)}
        className="dmb-stage dmb-stage--dark"
      >
        {(s) => (
          <div className="dmb-stat-wrap">
            <div className="dmb-stat-value">
              <Count value={s.on ? 0 : 12} format={(n) => `${Math.round(n)}%`} />
            </div>
            <div className="dmb-stat-label">
              <ShieldCheck size={14} strokeWidth={1.8} />
              <Text className="dmb-stat-caption">Original files overwritten</Text>
            </div>
          </div>
        )}
      </Stage>
    </div>
  );
}

const PRESETS = [
  { label: "< 100 KB", desc: "Scholarship portals", spec: "100 KB max" },
  { label: "< 200 KB", desc: "University uploads", spec: "200 KB max" },
  { label: "413×531", desc: "Passport photo", spec: "300 DPI JPG" },
];

function PresetsComponentPicture() {
  const [ref, width] = usePictureWidth();
  return (
    <div ref={ref} className="dmb-picture dmb-picture--full look-documind">
      <Stage
        width={width}
        height={188}
        initial={BEFORE}
        poster={AFTER}
        play="once"
        script={beat(2)}
        greys="cool"
        className="dmb-stage"
      >
        {(s) => {
          const activeIdx = s.on ? 2 : 0;
          const active = PRESETS[activeIdx];
          return (
            <div className="dmb-component-pad">
              <Segmented
                items={PRESETS.map((p) => p.label)}
                value={activeIdx}
                className="dmb-segmented"
              />
              <Card pad="small" className="dmb-preset-card">
                <div className="dmb-preset-row">
                  <FileCheck2 size={15} strokeWidth={1.8} className="dmb-accent-icon" />
                  <div className="dmb-preset-text">
                    <Text className="dmb-preset-title">{active.desc}</Text>
                    <Text className="dmb-preset-sub">{active.spec}</Text>
                  </div>
                  <Badge tone="accent">Ready</Badge>
                </div>
              </Card>
            </div>
          );
        }}
      </Stage>
    </div>
  );
}

function SecurityComponentPicture() {
  const [ref, width] = usePictureWidth();
  return (
    <div ref={ref} className="dmb-picture dmb-picture--full look-documind">
      <Stage
        width={width}
        height={188}
        initial={BEFORE}
        poster={AFTER}
        play="once"
        script={beat(3)}
        greys="cool"
        className="dmb-stage"
      >
        {(s) => (
          <div className="dmb-component-pad">
            <Card pad="medium" className="dmb-security-card">
              <div className="dmb-security-row">
                <Check pending={!s.on} on={s.on} size={20} />
                <div className="dmb-security-copy">
                  <Text className="dmb-preset-title">
                    {s.on ? "PDF sanitized & locked" : "Inspecting streams…"}
                  </Text>
                  <Text className="dmb-preset-sub">JS stripped • AES-256</Text>
                </div>
                <Lock size={14} strokeWidth={1.8} className="dmb-muted-icon" />
              </div>
              <div className="dmb-security-bars">
                <Bar w={92} h={6} tone={3} />
                <Bar w={64} h={6} tone={2} />
              </div>
            </Card>
          </div>
        )}
      </Stage>
    </div>
  );
}

const PLAN_NODES = ["Compress", "Number", "Protect"];

function CommandDiagramPicture() {
  const [ref, width] = usePictureWidth();
  return (
    <div ref={ref} className="dmb-picture dmb-picture--full look-documind">
      <Stage
        width={width}
        height={188}
        initial={BEFORE}
        poster={AFTER}
        play="once"
        script={beat(4)}
        greys="cool"
        className="dmb-stage"
      >
        {(s, rect) => {
          const targetRect = rect("plan-out");
          const toPt = {
            x: targetRect.x,
            y: targetRect.y + targetRect.height / 2,
          };
          return (
            <div className="dmb-diagram">
              <div className="dmb-diagram-col">
                {PLAN_NODES.map((label, idx) => (
                  <div key={label} data-target={`node-${idx}`} className="dmb-node">
                    <Text className="dmb-node__label">{label}</Text>
                  </div>
                ))}
              </div>

              <div data-target="plan-out" className="dmb-plan-target">
                <Terminal size={13} strokeWidth={1.8} className="dmb-accent-icon" />
                <Text className="dmb-plan-target__label">Approve</Text>
              </div>

              {PLAN_NODES.map((_, idx) => {
                const r = rect(`node-${idx}`);
                if (!r.width || !targetRect.width) return null;
                return (
                  <Connector
                    key={idx}
                    from={{ x: r.x + r.width, y: r.y + r.height / 2 }}
                    to={toPt}
                    route="step"
                    show={s.on}
                    dots={idx === 1 ? "end" : "none"}
                  />
                );
              })}
            </div>
          );
        }}
      </Stage>
    </div>
  );
}

export function DocuMindBento() {
  return (
    <div className="dmb-root">
      <div className="dmb-grid">
        <Tile
          area="hero"
          lead="Exact-KB Compression."
          body="Hit under 100 KB, 200 KB, or 1 MB for scholarship and university portals with real byte metrics."
          picture={<HeroCompressionPicture />}
        />
        <Tile
          area="stat"
          dark
          lead="Zero Overwrites."
          body="Original uploads remain intact as v1; every operation creates an immutable new version."
          picture={<ZeroOverwriteStatPicture />}
        />
        <Tile
          area="presets"
          lead="3-Click Portal Presets."
          body="Sized for exam forms, scholarships, and passport DPI limits."
          picture={<PresetsComponentPicture />}
        />
        <Tile
          area="security"
          lead="Protect & Sanitize."
          body="AES-256 encryption, magic-byte validation, and automatic PDF script stripping."
          picture={<SecurityComponentPicture />}
        />
        <Tile
          area="diagram"
          lead="One-Box Command Bar."
          body="Describe plain instructions and approve the exact multi-step plan first."
          picture={<CommandDiagramPicture />}
        />
      </div>
    </div>
  );
}
