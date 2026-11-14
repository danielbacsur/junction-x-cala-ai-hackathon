"use client";

import { useEffect, useRef, type ReactNode } from "react";

import type { CabalaState } from "@/components/cabala/states";

/** Below this rendered size the line stops boiling: the wobble only smears a small drawing. */
const BOIL_FROM = 64;

/**
 * The body is one flat blob with no outline, traced from the film's frame at 76.80 s. It is 200
 * units tall, and every other part is placed against it.
 */
const BODY =
  "M96.0 106.6C91.4 111.5 84.3 114.9 81.7 119.1C79.2 123.4 80.0 127.0 80.7 132.0C81.4 137.0 85.1 143.2 86.2 149.2C87.3 155.3 88.6 162.6 87.5 168.4C86.4 174.1 83.7 180.0 79.6 183.7C75.6 187.4 69.2 189.4 63.4 190.4C57.5 191.3 50.6 190.3 44.6 189.2C38.6 188.1 32.8 186.0 27.6 183.8C22.4 181.6 17.7 178.6 13.5 175.9C9.3 173.3 6.2 167.8 2.5 168.0C-1.2 168.2 -4.1 173.2 -8.6 176.9C-13.2 180.7 -18.8 186.8 -24.8 190.5C-30.7 194.2 -38.1 197.8 -44.6 199.0C-51.1 200.2 -58.6 200.2 -63.8 197.8C-68.9 195.4 -73.3 190.1 -75.3 184.4C-77.2 178.6 -76.5 170.1 -75.4 163.2C-74.3 156.3 -69.8 148.5 -68.8 142.9C-67.8 137.4 -66.8 133.7 -69.5 130.0C-72.2 126.2 -79.7 124.3 -84.9 120.4C-90.2 116.5 -96.4 111.9 -101.1 106.6C-105.7 101.2 -110.7 94.6 -112.7 88.3C-114.8 82.0 -115.4 74.7 -113.5 68.9C-111.6 63.1 -107.1 57.2 -101.3 53.7C-95.4 50.2 -86.5 48.2 -78.4 47.8C-70.2 47.5 -57.8 53.0 -52.5 51.6C-47.2 50.1 -48.4 44.2 -46.5 39.2C-44.5 34.2 -43.7 26.5 -40.8 21.6C-37.9 16.8 -33.4 13.1 -28.9 9.9C-24.4 6.8 -19.2 4.4 -13.9 2.7C-8.7 1.1 -3.0 0.0 2.5 0.2C8.0 0.3 13.8 1.5 18.8 3.7C23.9 5.8 29.1 8.6 32.8 13.2C36.5 17.8 39.4 24.6 41.0 31.0C42.6 37.4 37.9 50.0 42.5 51.5C47.1 53.1 60.3 42.2 68.7 40.4C77.1 38.6 86.3 38.8 93.0 40.8C99.7 42.8 105.4 47.4 109.0 52.3C112.7 57.2 114.8 63.9 114.8 70.1C114.9 76.3 112.5 83.6 109.3 89.7C106.2 95.7 100.6 101.7 96.0 106.6Z";

/**
 * Arms, each drawn for the viewer's right; the left side mirrors them. An arm starts inside a side
 * lobe with no shoulder line, as in the film, so every path is left open at that end.
 */
const ARM = {
  hang: "M90 88C94 108 95 128 94 145C91 153 92 164 99 169C104 172 111 172 115 168C121 163 121 152 117 145C118 125 115 105 108 86",
  hangFingers: "M103 161L102 170M110 161L111 170",

  hip: "M100 78L127 110C131 115 130 119 125 122L84 147C76 154 62 156 54 148C46 140 50 126 60 124C66 122 72 124 76 128L103 111L88 94",
  hipForearm: "M125 122L84 147C76 154 62 156 54 148C46 140 50 126 60 124C66 122 72 124 76 128L103 111L127 110C131 115 130 119 125 122Z",
  hipKnuckles: "M56 134C60 136 61 141 58 146M63 130C68 133 69 139 66 144",

  // The forearm stands under the chin, elbow low inside the body, so nothing pokes out of the blob.
  chin: "M112 90C112 116 106 140 94 152C88 158 80 156 74 150L40 100C30 100 21 92 21 81C21 70 30 62 40 63C50 64 57 71 57 80L84 122C90 112 94 100 96 88",
  chinKnuckles: "M29 76C33 78 34 83 32 88M36 72C40 75 41 80 39 85",

  // The open hand that asks for the customer: a thumb and three fingers, palm out.
  wave: "M92 60L116 -4C106 -8 99 -20 101 -28C103 -35 111 -33 114 -27L112 -50C112 -58 122 -58 122 -50L123 -36L125 -56C126 -64 136 -63 135 -55L134 -36L139 -49C142 -56 151 -52 148 -45L142 -26C142 -14 138 -4 134 2L112 66",

  hold: "M96 80C92 98 78 110 58 112C50 108 40 112 38 121C37 130 45 136 53 134C58 133 61 130 62 127C82 124 100 112 110 92",
  holdKnuckles: "M45 117C48 120 48 125 46 129",

  typeNear: "M94 84C92 104 84 122 74 130C66 128 58 134 58 142C58 150 66 154 74 152C82 151 86 144 84 137C94 126 104 108 108 90",
  typeNearKnuckles: "M65 138C68 140 69 145 67 148M71 136C74 138 75 143 73 147",
  typeFar: "M-36 110C-14 112 6 120 22 130C30 126 40 130 42 138C44 146 36 153 28 152C22 151 17 147 16 142C0 138 -16 134 -34 130",
  typeFarKnuckles: "M27 138C30 140 31 145 29 148M33 136C36 138 37 143 35 147",
} as const;

const MIRROR = "translate(-2 2) scale(-1 1)";

/** The two brows are short arcs with hatch ticks, the film's way of drawing them. */
function Brows({ worried = false, lifted = 0, liftRight = 0 }: { worried?: boolean; lifted?: number; liftRight?: number }) {
  return (
    <g transform={`translate(0 ${-lifted})`}>
      <g transform={worried ? "translate(0 -2) rotate(-24 -6 18)" : undefined}>
        <path className="ln thin" d="M-20 19C-16 16 -10 16 -6 18M-17 17l-1.6-5M-12.6 16l-0.6-5.2M-8.4 16.6l0.8-5" />
      </g>
      <g transform={`translate(0 ${-liftRight - (worried ? 2 : 0)})${worried ? " rotate(24 5 18)" : ""}`}>
        <path className="ln thin" d="M5 18C9 15.6 14 15.6 18 17.6M7.6 16.4l-0.8-5M12 15.8l0.2-5.2M16 16.6l1.4-5" />
      </g>
    </g>
  );
}

function Eyes({ closed = false, gaze = [0, 0] }: { closed?: boolean; gaze?: readonly [number, number] }) {
  if (closed) {
    return <path className="ln" d="M-17 36C-14.5 41 -8.5 41 -6 36M5.5 35.5C8 40.5 14 40.5 16.5 35.5" />;
  }

  return (
    <g className="eyes">
      <g transform={`translate(${gaze[0]} ${gaze[1]})`}>
        <g className="pupils">
          <ellipse className="ink" cx="-11.5" cy="37" rx="3" ry="7" />
          <ellipse className="ink" cx="11" cy="36.5" rx="3" ry="7" />
        </g>
      </g>
    </g>
  );
}

/** The cap as it is mostly worn: cream crown, black peak pointing to the viewer's right. */
function Cap({ slumped = false }: { slumped?: boolean }) {
  return (
    <g transform={slumped ? "translate(3 10) rotate(7 0 0)" : undefined}>
      <g transform="translate(-6 12) scale(1.16) translate(6 -12)">
        <path className="paper-ln" d="M-41 12C-44 -8 -36 -34 -12 -44C6 -50 24 -36 29 -17Z" />
        <path
          className="ink"
          d="M-42 13L29 -18C38 -21 50 -21 56 -17C55 -10 47 -5 40 -3C28 0 10 3 -8 8C-20 11 -32 14 -42 13Z"
        />
      </g>
    </g>
  );
}

/** The cap with its peak flipped up, as in the film's hands-on-hips shot. */
function CapFlipped() {
  return (
    <g>
      <path className="paper-ln" d="M-37.6 13.6C-38 0 -34 -8 -30.4 -13.9C-26 -22 -20 -27 -14.2 -29.2C-8 -31.5 -2 -31.6 2.1 -31.3L-14 -20Z" />
      <path
        className="ink"
        d="M-38.6 13.6L-14 -20C-6 -32 8 -42 18.5 -40.4C28 -40 34 -36 35 -32C40 -20 42.5 -6 40 15.7C30 6 20 2.5 10 1.4C0 .5 -8 1.5 -14 2.4C-24 4 -32 8 -38.6 13.6Z"
      />
      <circle cx="28" cy="-8" r="1.4" fill="var(--color-card)" />
      <circle cx="31.5" cy="-5.5" r=".9" fill="var(--color-card)" />
    </g>
  );
}

const MOUTH: Record<CabalaState, ReactNode> = {
  idle: <path className="ln" d="M-25 50C-17 75 14 77 26 48M23 44l6 5" />,
  working: <path className="ln" d="M-25 50C-17 75 14 77 26 48M23 44l6 5" />,
  reading: <path className="ln" d="M-15 56C-9 67 9 68 16 55" />,
  thinking: <path className="ln" d="M-4 63C0 66 6 61 12 62" />,
  // The film's greeting: an open laugh with a band of top teeth. It is held, never flapped.
  waiting: (
    <>
      <path className="ink" d="M-26 50L27 43C30 68 18 93 0 94C-17 94 -28 72 -26 50Z" />
      <path className="paper-ln" d="M-26 50L27 43C28 49 28 53 27 57L-25 63C-26 58 -26.5 54 -26 50Z" />
    </>
  ),
  // The signature grin: cream, a shallow V on top, three lines for four big teeth.
  done: (
    <>
      <path
        className="paper-ln"
        d="M-30 50L-1 58.5L35 41C43 46 44 60 41 68C37 90 18 103 -2 103.5C-25 103 -43 88 -44.5 68C-45 58 -40 51 -30 50Z"
      />
      <path className="ln" d="M-33 51L-34 90M-1 58.5L-1 103M27 45L31 85" />
    </>
  ),
  error: <path className="ln" d="M-10 70C-4 66 5 66 11 71" />,
  asleep: <path className="ln" d="M-5 63C-1 65.5 5 65.5 9 63" />,
};

const GAZE: Partial<Record<CabalaState, readonly [number, number]>> = {
  thinking: [2.5, -3.5],
  reading: [0, 4],
  working: [3, 3],
  error: [-1, 1.5],
};

function Arm({ d, detail, mirrored = false }: { d: string; detail?: string; mirrored?: boolean }) {
  return (
    <g transform={mirrored ? MIRROR : undefined}>
      <path className="ln" d={d} />
      {detail && <path className="ln" d={detail} />}
    </g>
  );
}

/** The paper-coloured fill that sits under the body, so an arm outside it is not see-through. */
function ArmFill({ d, mirrored = false }: { d: string; mirrored?: boolean }) {
  return <path className="paper" d={d} transform={mirrored ? MIRROR : undefined} />;
}

function HipArm({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <g transform={mirrored ? MIRROR : undefined}>
      <path className="paper" d={ARM.hipForearm} />
      <path className="ln" d={ARM.hip} />
      <path className="ln" d={ARM.hipKnuckles} />
    </g>
  );
}

/** Stops the loops while the figure is off screen or its tab is hidden. */
function usePausedWhenHidden() {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;

    let onScreen = true;

    const apply = () => svg.toggleAttribute("data-paused", !onScreen || document.hidden);

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      apply();
    });

    observer.observe(svg);
    document.addEventListener("visibilitychange", apply);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", apply);
    };
  }, []);

  return ref;
}

/**
 * Cabala, drawn after the protagonist of Cala's intro film: the flat salmon five-lobed blob with
 * the cap and the grin. `full` is the whole figure, for hire, waiting and delivery moments; `bust`
 * is the head in a circle, for work-log lines.
 */
export function Cabala({
  state = "idle",
  size = 160,
  variant = "full",
  title,
  className = "",
}: {
  state?: CabalaState;
  size?: number;
  variant?: "full" | "bust";
  /** Read out by screen readers. Leave it out where the text beside the figure says the same. */
  title?: string;
  className?: string;
}) {
  const ref = usePausedWhenHidden();

  const bust = variant === "bust";
  const hanging = state === "idle" || state === "error" || state === "asleep";

  return (
    <svg
      ref={ref}
      className={`cabala ${className}`}
      data-state={state}
      data-variant={variant}
      data-boil={!bust && size >= BOIL_FROM ? "" : undefined}
      viewBox={bust ? "-68 -56 136 136" : "-170 -84 340 340"}
      width={size}
      height={size}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <g className="all">
        {!bust && <path className="ln" d="M-120 242C-60 240 60 243 132 241" />}

        <g className="figure">
          {/* Legs: two tubes sharing a centre line, the feet flaring outward. */}
          <path className="paper-ln" d="M-27 158L-25 226L-49 240L4 241L4 158" />
          <path className="paper" d="M40 158L39 226L63 240L4 241L4 158Z" />
          <path className="ln" d="M40 158L39 226L63 240L4 241" />

          <g>
            {(hanging || state === "thinking") && <ArmFill d={ARM.hang} mirrored />}
            {hanging && <ArmFill d={ARM.hang} />}
            {state === "thinking" && <ArmFill d={ARM.chin} />}
            {state === "waiting" && (
              <g className="wave">
                <ArmFill d={ARM.wave} />
              </g>
            )}
            {(state === "done" || state === "waiting") && <ArmFill d={ARM.hip} mirrored />}
            {state === "done" && <ArmFill d={ARM.hip} />}
          </g>

          <path className="body" d={BODY} />
          <g className="grain">
            <circle cx="-62" cy="96" r="1" />
            <circle cx="58" cy="150" r=".9" />
            <circle cx="-30" cy="160" r=".8" />
            <circle cx="84" cy="62" r=".9" />
            <circle cx="-88" cy="70" r=".8" />
            <circle cx="22" cy="128" r=".7" />
          </g>

          <g className="head">
            {state === "done" ? <CapFlipped /> : <Cap slumped={state === "asleep"} />}

            <path className="cheek" d="M-42 33l3 4 2-6 3 6 2-6 3 6 2-5" />
            <path className="cheek" d="M25 28l3 4 2-6 3 6 2-6 3 6 2-5" />

            {state !== "asleep" && (
              <Brows
                worried={state === "error"}
                lifted={state === "waiting" ? 3 : 0}
                liftRight={state === "thinking" ? 4 : 0}
              />
            )}
            <Eyes closed={state === "asleep"} gaze={GAZE[state]} />

            {MOUTH[state]}
          </g>

          {/* Arms that cross the body are drawn over it. */}
          <g>
            {(hanging || state === "thinking") && <Arm d={ARM.hang} detail={ARM.hangFingers} mirrored />}
            {hanging && <Arm d={ARM.hang} detail={ARM.hangFingers} />}
            {state === "thinking" && <Arm d={ARM.chin} detail={ARM.chinKnuckles} />}
            {state === "waiting" && (
              <g className="wave">
                <Arm d={ARM.wave} />
              </g>
            )}
            {(state === "done" || state === "waiting") && <HipArm mirrored />}
            {state === "done" && <HipArm />}
          </g>

          {state === "reading" && (
            <g>
              <g transform="rotate(-3 2 120)">
                <path className="paper-ln" d="M-30 92L36 92C39 92 41 94 41 97L41 146C41 149 39 151 36 151L-30 151C-33 151 -35 149 -35 146L-35 97C-35 94 -33 92 -30 92Z" />
                <path className="ln thin" d="M-24 105L30 105M-24 116L30 116M-24 127L22 127M-24 138L10 138" />
              </g>
              <path className="skin-ln" d={ARM.hold} />
              <path className="ln" d={ARM.holdKnuckles} />
              <g transform="translate(6 0) scale(-1 1)">
                <path className="skin-ln" d={ARM.hold} />
                <path className="ln" d={ARM.holdKnuckles} />
              </g>
            </g>
          )}

          {state === "working" && (
            <g>
              {/* A laptop seen from the side, as on the film's beach, with both fists on its keys. */}
              <path className="paper-ln" d="M98 150L123 88C124 85 126 84 129 84L152 84C155 84 156 86 155 89L130 150Z" />
              <path className="paper-ln" d="M6 150L132 150C136 150 138 152 138 155C138 158 136 160 132 160L6 160C2 160 0 158 0 155C0 152 2 150 6 150Z" />
              <g className="tap-a">
                <path className="skin-ln" d={ARM.typeFar} />
                <path className="ln" d={ARM.typeFarKnuckles} />
              </g>
              <g className="tap-b">
                <path className="skin-ln" d={ARM.typeNear} />
                <path className="ln" d={ARM.typeNearKnuckles} />
              </g>
            </g>
          )}

          {/* The film's scribble of noise, redrawing itself over two thought dots. */}
          {state === "thinking" && !bust && (
            <g>
              <circle className="paper-ln" cx="62" cy="-14" r="3.2" />
              <circle className="paper-ln" cx="72" cy="-27" r="4.6" />
              <g className="spin">
                <path
                  className="ln scribble"
                  d="M78 -44C84 -62 108 -64 110 -46C112 -30 86 -26 82 -42C79 -56 100 -62 106 -50C111 -38 92 -30 86 -40C81 -50 96 -58 102 -50C107 -42 94 -34 88 -42C84 -50 98 -54 100 -46C101 -40 92 -38 90 -44"
                />
              </g>
            </g>
          )}

          {state === "done" && !bust && (
            <g>
              <g className="spark">
                <path className="ln" d="M-128 6l10 8M-138 30l13 1M-120 -18l6 12" />
              </g>
              <g className="spark">
                <path className="ln" d="M132 4l-10 8M142 28l-13 1M124 -20l-6 12" />
              </g>
            </g>
          )}

          {state === "error" && (
            <g className="sweat">
              <path className="drop" d="M58 2C62 10 66 14 66 19C66 24 62 27 58 27C54 27 50 24 50 19C50 14 54 10 58 2Z" />
            </g>
          )}

          {state === "asleep" && !bust && (
            <g>
              <path className="ln zed" d="M62 -22L74 -22L62 -8L74 -8" />
              <path className="ln zed" d="M82 -46L98 -46L82 -28L98 -28" />
              <path className="ln zed" d="M106 -76L126 -76L106 -54L126 -54" />
            </g>
          )}
        </g>
      </g>
    </svg>
  );
}

/**
 * The four displacement filters behind the line boil, each with its own noise. They are defined
 * once for the page, and the stylesheet steps a figure through them.
 */
export function CabalaDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
      <defs>
        {[2, 9, 15, 5].map((seed, index) => (
          <filter key={seed} id={`cabala-boil-${index + 1}`} x="-12%" y="-12%" width="124%" height="124%">
            <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed={seed} result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        ))}
      </defs>
    </svg>
  );
}
