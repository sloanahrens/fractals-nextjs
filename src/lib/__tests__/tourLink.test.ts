import { describe, expect, it } from "vitest";

import { defaultVariant } from "../fractalTypes";
import {
  MAX_TOUR_LINK_LENGTH,
  MAX_TOUR_STOPS,
  decodeTourLink,
  encodeTourLink,
} from "../tourLink";
import {
  DEFAULT_VIEW_LINK_UPDATES,
  type ViewLinkUpdates,
} from "../viewLinkState";
import { decodeTour, decodeView, encodeView } from "../viewLink";

/**
 * A stop that a link carries exactly: the canvas size is the page's own (a stop
 * does not carry it) and a stop whose zoom picks the count carries the page's
 * own count too, so these are the stops a round trip can be asserted on whole.
 */
const stop = (changes: Partial<ViewLinkUpdates>): ViewLinkUpdates => ({
  fractalType: "mandelbrot",
  variant: defaultVariant("julia"),
  centerX: 0,
  centerY: 0,
  zoomLevel: 1,
  colorScheme: "classic",
  reverse: false,
  shift: 0,
  trap: null,
  autoIterationsOn: true,
  maxIterations: DEFAULT_VIEW_LINK_UPDATES.maxIterations,
  canvasWidth: 800,
  canvasHeight: 600,
  ...changes,
});

const MANDELBROT = stop({ centerX: -0.75 });
const JULIA = stop({
  fractalType: "julia",
  variant: "Dendrite",
  centerX: -0.5,
  centerY: 0.25,
  zoomLevel: 400,
  colorScheme: "fire",
});
const SHIP = stop({
  fractalType: "burning-ship",
  centerX: -1.7548,
  centerY: -0.028,
  zoomLevel: 120,
  colorScheme: "rainbow",
  reverse: true,
  shift: 0.25,
});
const TRICORN = stop({
  fractalType: "tricorn",
  centerX: 0.872,
  centerY: 1.51,
  zoomLevel: 50,
});
const CELTIC = stop({
  fractalType: "celtic",
  centerX: -1.3,
  centerY: 0.7,
  zoomLevel: 4,
});
const PERPENDICULAR_SHIP = stop({
  fractalType: "perpendicular-ship",
  centerX: -0.55,
  centerY: 0,
  zoomLevel: 1,
});
const MULTIBROT = stop({
  fractalType: "multibrot",
  variant: "4",
  centerX: -0.25,
  centerY: 0.5,
  zoomLevel: 12,
  colorScheme: "ocean",
  autoIterationsOn: false,
  maxIterations: 400,
});
const NEWTON = stop({
  fractalType: "newton",
  variant: "3",
  centerX: -0.793701,
  centerY: 0,
  zoomLevel: 150,
  colorScheme: "grayscale",
  reverse: true,
});

const MAGNET = stop({
  fractalType: "magnet",
  variant: "2",
  centerX: 1.6,
  centerY: 1.05,
  zoomLevel: 8,
});

// One stop per fractal, as many as a tour link can hold. The picker offers
// eleven fractals and `MAX_TOUR_STOPS` is eight, so one link cannot name them
// all; MAGNET, the Phoenix and Nova are left out here and are round-tripped in
// their own tests below.
const EVERY_FRACTAL = [
  MANDELBROT,
  JULIA,
  SHIP,
  TRICORN,
  MULTIBROT,
  NEWTON,
  CELTIC,
  PERPENDICULAR_SHIP,
];

describe("encodeTourLink", () => {
  it("writes one column per field, in the codec's order", () => {
    expect(encodeTourLink([MANDELBROT, JULIA])).toBe(
      "v=1&t.f=mandelbrot~julia&t.k=~Dendrite&t.x=-0.75~-0.5&t.y=0~0.25&t.z=1~400&t.s=classic~fire",
    );
  });

  it("carries no canvas size and no count for a stop whose zoom picks one", () => {
    const link = encodeTourLink([
      stop({ canvasWidth: 400, canvasHeight: 300 }),
      stop({ centerX: -0.5, canvasWidth: 1200, canvasHeight: 900 }),
    ]);

    expect(link).not.toContain("w");
    expect(link).not.toContain("i=");
    // A stop read back is drawn on the page's own canvas and at the count its
    // zoom asks for, which is what a stop that names neither means.
    expect(decodeTourLink(link!)).toEqual([
      stop({ canvasWidth: 800, canvasHeight: 600 }),
      stop({ centerX: -0.5, canvasWidth: 800, canvasHeight: 600 }),
    ]);
  });

  it("carries the scheme's own settings, and the count when one is named", () => {
    const link = encodeTourLink([SHIP, MULTIBROT]);

    expect(link).toContain("t.r=1~");
    expect(link).toContain("t.o=0.25~");
    expect(link).toContain("t.i=~400");
    expect(decodeTourLink(link!)).toEqual([SHIP, MULTIBROT]);
  });

  it("carries a stop's orbit trap in a t.m column that exists only when some stop has one", () => {
    const trapped = stop({ centerX: -0.5, trap: "circle" });

    expect(encodeTourLink([MANDELBROT, JULIA])).not.toContain("t.m");

    const link = encodeTourLink([MANDELBROT, trapped, JULIA]);
    expect(link).toContain("t.m=~circle~");
    // The codec's order: the colour columns, then the trap, then the count.
    expect(link!.indexOf("t.s=")).toBeLessThan(link!.indexOf("t.m="));
    expect(decodeTourLink(link!)).toEqual([MANDELBROT, trapped, JULIA]);
  });

  it("round-trips every shape, and a trap-free stop beside a trapped one stays plain", () => {
    for (const trap of ["point", "line", "circle"] as const) {
      const stops = [stop({ trap }), stop({ centerX: -0.5, trap: null })];
      const read = decodeTourLink(encodeTourLink(stops)!)!;

      expect(read[0].trap).toBe(trap);
      expect(read[1].trap).toBeNull();
    }
  });

  it("ignores a trap column value it cannot read, and keeps the stop", () => {
    const link = "v=1&t.f=mandelbrot~julia&t.m=spiral~line";
    const read = decodeTourLink(link)!;

    expect(read).toHaveLength(2);
    expect(read[0].trap).toBeNull();
    expect(read[1].trap).toBe("line");
  });

  it("keeps a full tour of trapped stops inside the link's limit", () => {
    const stops = Array.from({ length: 8 }, (_, index) =>
      stop({
        fractalType: "multibrot",
        variant: "4",
        centerX: -0.7436438870371587 + index * 0.01,
        centerY: 0.1318259042053119,
        zoomLevel: 123.456789 + index,
        colorScheme: "fire",
        reverse: true,
        shift: 0.25,
        trap: "circle",
        autoIterationsOn: false,
        maxIterations: 430,
      }),
    );
    const link = encodeTourLink(stops);

    expect(link).not.toBeNull();
    expect(link!.length).toBeLessThanOrEqual(MAX_TOUR_LINK_LENGTH);
    expect(decodeTourLink(link!)).toHaveLength(8);
  });

  it("carries a magnetic type beside the fractal that draws it", () => {
    // The type is the codec's `k` field, written beside the fractal that takes
    // one and read back by the same rules a Julia constant is.
    const link = encodeTourLink([MAGNET, MANDELBROT]);

    expect(link).toContain("t.f=magnet~mandelbrot");
    expect(link).toContain("t.k=2~");
    expect(decodeTourLink(link!)).toEqual([MAGNET, MANDELBROT]);
  });

  it("carries a Phoenix constant beside the fractal that draws it", () => {
    const phoenix = stop({
      fractalType: "phoenix",
      variant: "Spirals",
      centerX: 0.4,
      centerY: 0.55,
      zoomLevel: 5,
    });
    const link = encodeTourLink([phoenix, MANDELBROT]);

    expect(link).toContain("t.f=phoenix~mandelbrot");
    expect(link).toContain("t.k=Spirals~");
    expect(decodeTourLink(link!)).toEqual([phoenix, MANDELBROT]);
  });

  it("carries Nova's id and no variant", () => {
    const nova = stop({
      fractalType: "nova",
      centerX: -0.55,
      centerY: 0,
      zoomLevel: 1.5,
    });
    const link = encodeTourLink([nova, MANDELBROT]);

    expect(link).toContain("t.f=nova~mandelbrot");
    expect(link).not.toContain("t.k=");
    expect(decodeTourLink(link!)).toEqual([nova, MANDELBROT]);
  });

  it("drops a magnetic type the Magnet cannot draw, as it drops a bad power", () => {
    const stops = decodeTourLink(
      "v=1&t.f=magnet~julia&t.k=3~Dendrite&t.x=1.3~0&t.y=0~0&t.z=1~400",
    );

    expect(stops![0].fractalType).toBe("magnet");
    expect(stops![0].variant).toBe("1");
    expect(stops![1].variant).toBe("Dendrite");
  });

  it("refuses fewer than two stops", () => {
    expect(encodeTourLink([])).toBeNull();
    expect(encodeTourLink([MANDELBROT])).toBeNull();
    expect(encodeTourLink([stop({}), stop({})])).not.toBeNull();
  });

  it("cuts a longer tour to its last eight distinct stops", () => {
    // Ten stops, the ninth the same view as the first, so the last eight
    // distinct ones are the third through the eighth, the first again, and the
    // tenth: the second is dropped and the repeat is not counted twice.
    const nine = [
      MANDELBROT,
      JULIA,
      SHIP,
      TRICORN,
      MULTIBROT,
      NEWTON,
      stop({ centerX: 1 }),
      stop({ centerX: 2 }),
      MANDELBROT,
      stop({ centerX: 3 }),
    ];
    const stops = decodeTourLink(encodeTourLink(nine)!);

    expect(stops).not.toBeNull();
    expect(stops!.length).toBe(MAX_TOUR_STOPS);
    expect(stops).toEqual([
      SHIP,
      TRICORN,
      MULTIBROT,
      NEWTON,
      nine[6],
      nine[7],
      MANDELBROT,
      nine[9],
    ]);
  });

  it("keeps a tour of eight or fewer exactly as it was given", () => {
    const stops = decodeTourLink(encodeTourLink(EVERY_FRACTAL)!);

    expect(stops).toEqual(EVERY_FRACTAL);
  });

  it("keeps every stop of a full tour inside the link's own limit", () => {
    const longest = [
      stop({ fractalType: "julia", variant: "custom:-1.234567,-1.234567" }),
      stop({
        fractalType: "julia",
        variant: "custom:1.234567,1.234567",
        centerX: -9.999999999,
        centerY: -9.999999999,
        zoomLevel: 10000,
        colorScheme: "grayscale",
        reverse: true,
        shift: 0.99,
        autoIterationsOn: false,
        maxIterations: 1000,
      }),
      stop({ fractalType: "burning-ship", centerX: -9.999999999 }),
      stop({ fractalType: "multibrot", variant: "5", centerY: 9.999999999 }),
      stop({ fractalType: "tricorn", zoomLevel: 9999.5 }),
      stop({ fractalType: "newton", variant: "3", centerX: 9.999999999 }),
      JULIA,
      MANDELBROT,
    ];
    const link = encodeTourLink(longest)!;

    expect(link).not.toBeNull();
    expect(link.length).toBeLessThan(MAX_TOUR_LINK_LENGTH);
    expect(decodeTourLink(link)).toEqual(longest);
  });
});

describe("decodeTourLink", () => {
  it("round-trips two, five and eight stops, in order", () => {
    const tours = [
      EVERY_FRACTAL.slice(0, 2),
      EVERY_FRACTAL.slice(0, 5),
      EVERY_FRACTAL,
    ];

    for (const stops of tours) {
      const link = encodeTourLink(stops);

      expect(link).not.toBeNull();
      expect(decodeTourLink(link!)).toEqual(stops);
      // The leading `#` of a fragment copied out of a URL bar is not part of it.
      expect(decodeTourLink(`#${link}`)).toEqual(stops);
    }
  });

  it("reads a stop through the codec, so a stop is judged as a view is", () => {
    // Every field of the middle stop is a value the codec refuses, so that stop
    // has nothing readable in it at all and the two around it are kept.
    const link =
      "v=1&t.f=mandelbrot~lyapunov~julia&t.k=~nonsense~Dendrite&t.x=-0.75~oops~-0.5" +
      "&t.y=0~oops~0.25&t.z=1~oops~400&t.s=classic~neon~fire";
    const stops = decodeTourLink(link);

    expect(stops).not.toBeNull();
    expect(stops!.length).toBe(2);
    expect(stops![0]).toEqual(MANDELBROT);
    expect(stops![1].fractalType).toBe("julia");
    expect(stops![1].colorScheme).toBe("fire");
  });

  it("fills a stop's missing fields from the page's defaults", () => {
    const stops = decodeTourLink(
      "v=1&t.f=mandelbrot~julia&t.x=-0.75~-0.5&t.z=~400",
    );

    // The first stop says nothing about its imaginary part, its zoom, its
    // scheme or its iterations, and is the page's own view of the set.
    expect(stops![0]).toEqual(MANDELBROT);
    expect(stops![1].fractalType).toBe("julia");
    expect(stops![1].zoomLevel).toBe(400);
    expect(stops![1].colorScheme).toBe(DEFAULT_VIEW_LINK_UPDATES.colorScheme);
  });

  it("takes a stop whose fractal does not take its variant", () => {
    const stops = decodeTourLink("v=1&t.f=mandelbrot~multibrot&t.k=4~Dendrite");

    expect(stops!.length).toBe(2);
    // The value the Multibrot cannot draw is its own default power, and the
    // Mandelbrot set — which takes no variant — keeps the one it holds.
    expect(stops![0].variant).toBe(DEFAULT_VIEW_LINK_UPDATES.variant);
    expect(stops![1].fractalType).toBe("multibrot");
    expect(stops![1].variant).toBe("3");
  });

  it("is null for fewer than two stops", () => {
    expect(decodeTourLink("")).toBeNull();
    expect(decodeTourLink("#")).toBeNull();
    expect(decodeTourLink("v=1")).toBeNull();
    expect(decodeTourLink("v=1&t.f=mandelbrot&t.z=1")).toBeNull();
    expect(decodeTourLink("v=1&t.f=mandelbrot")).toBeNull();
  });

  it("is null for another version, and for a link past its own limit", () => {
    expect(decodeTourLink("v=2&t.f=mandelbrot~julia")).toBeNull();
    expect(decodeTourLink("v=0&t.f=mandelbrot~julia")).toBeNull();
    expect(
      decodeTourLink(`v=1&t.f=${"A".repeat(MAX_TOUR_LINK_LENGTH)}~julia`),
    ).toBeNull();
    expect(decodeTourLink("x".repeat(MAX_TOUR_LINK_LENGTH + 1))).toBeNull();
  });

  it("reads only the first eight stops of a longer link", () => {
    // Built by hand rather than through the encoder, which cuts a longer tour to
    // eight stops of its own accord: this asks what the reader does with one.
    const text = (length: number) =>
      `v=1&t.f=${Array.from({ length }, () => "julia").join("~")}` +
      `&t.x=${Array.from({ length }, (_, i) => -i).join("~")}`;
    const stops = decodeTourLink(text(12));

    expect(stops).not.toBeNull();
    expect(stops!.length).toBe(MAX_TOUR_STOPS);
    expect(stops![0].centerX).toBe(0);
    expect(stops![MAX_TOUR_STOPS - 1].centerX).toBe(-(MAX_TOUR_STOPS - 1));
    // Nine stops is one too many and eight is exactly enough.
    expect(decodeTourLink(text(9))!.length).toBe(MAX_TOUR_STOPS);
    expect(decodeTourLink(text(8))!.length).toBe(MAX_TOUR_STOPS);
  });

  it("never throws, whatever it is handed", () => {
    const hostile = [
      "",
      "#",
      "v=1",
      "%",
      "v=1&t.f=%",
      "v=1&t.f=mandelbrot%",
      "v=1&t.f=>",
      "v=1&t.f=mandelbrot~julia~",
      "v=1&t.f=",
      "v=1&t.x=~",
      "v=1&t.x=" + "9".repeat(5000),
      "v=1&t.f=%2566ractal~julia",
      "v=1&t.f=%2566ractal~%2566ractal",
      "v=1&t.f=<script>alert(1)</script>~<img src=x onerror=alert(1)>",
      "v=1&t.f=javascript:alert(1)~julia",
      "v=1&t.f={{7*7}}~julia",
      "v=1&t.f=\u0000‮~julia",
      "v=1&t.f=mandelbrot&t.f=julia",
      "t.f=mandelbrot~julia",
      "&&&v=1&&t.f=mandelbrot~julia&&",
      "v=1&t.f[]=mandelbrot~julia",
      "v=1&t.f=mandelbrot~julia&t.x=a=b~c=d",
    ];

    for (const text of hostile) {
      let read: unknown;
      expect(() => {
        read = decodeTourLink(text);
      }).not.toThrow();
      expect(read === null || Array.isArray(read)).toBe(true);
    }

    // Not a string at all: a caller's mistake, not a crash.
    expect(decodeTourLink(undefined as unknown as string)).toBeNull();
  });

  it("never lets script-looking text near what it returns", () => {
    const stops = decodeTourLink(
      "v=1&t.f=<script>alert(1)</script>~julia&t.k=~<img src=x onerror=alert(1)>" +
        "&t.s=classic~neon",
    );
    const values = stops!
      .map((view) => Object.values(view).join(" "))
      .join(" ");

    expect(values).not.toMatch(/[<>]|script|onerror/);
    // What was refused is the codec's default, not a copy of the text.
    expect(stops![0].fractalType).toBe("mandelbrot");
    expect(stops![0].colorScheme).toBe("classic");
    expect(stops![1].variant).toBe("Classic");
    expect(stops![1].colorScheme).toBe(DEFAULT_VIEW_LINK_UPDATES.colorScheme);
  });

  it("reads a view link as no tour, and a tour link as no view", () => {
    const view = encodeView({
      ...MANDELBROT,
      canvasWidth: 800,
      canvasHeight: 600,
    });
    const tour = encodeTourLink([MANDELBROT, JULIA])!;

    // The two readers cannot be confused: a view link has no column of stops,
    // and a tour link's version and fields are not a view's.
    expect(decodeTourLink(view)).toBeNull();
    expect(decodeView(tour)).toEqual({});
    expect(decodeTour(tour)).toBe(false);
    // A view link is still a view, and a `#tour` request is still a request.
    expect(decodeView(view).fractalType).toBe("mandelbrot");
    expect(decodeTour("#tour")).toBe(true);
    expect(
      decodeTour(
        encodeView({ ...MANDELBROT, canvasWidth: 800, canvasHeight: 600 }),
      ),
    ).toBe(false);
  });
});
