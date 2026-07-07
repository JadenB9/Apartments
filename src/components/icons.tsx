// Tiny inline SVG icon set. 16×16 viewBox, stroked, currentColor — sized by CSS.

import type { JSX } from "preact";

type IconProps = JSX.SVGAttributes<SVGSVGElement>;

const base = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "1.5",
  "stroke-linecap": "round" as const,
  "stroke-linejoin": "round" as const,
  "aria-hidden": true,
};

export const BuildingIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M3 14V3.5A1.5 1.5 0 0 1 4.5 2h4A1.5 1.5 0 0 1 10 3.5V14M10 6h2.5A1.5 1.5 0 0 1 14 7.5V14M1.5 14h13M5.5 5h2M5.5 8h2M5.5 11h2" />
  </svg>
);

export const FoodIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 2v5.5M6.5 2v5.5M5.25 2v12M5.25 7.5c-1.25 0-2-.75-2-2M5.25 7.5c1.25 0 2-.75 2-2M11.5 2c-1.5 1-2.25 3-2.25 5 0 1.5.75 2 1.5 2H12M12 2v12" />
  </svg>
);

export const BagIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M3 5.5h10l-.7 8a1.5 1.5 0 0 1-1.5 1.4H5.2a1.5 1.5 0 0 1-1.5-1.4l-.7-8ZM5.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5" />
  </svg>
);

export const TicketIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M2 6.5V4.8c0-.4.3-.8.8-.8h10.4c.5 0 .8.4.8.8v1.7a1.5 1.5 0 0 0 0 3v1.7c0 .4-.3.8-.8.8H2.8a.75.75 0 0 1-.8-.8V9.5a1.5 1.5 0 0 0 0-3ZM9.5 4v8" stroke-dasharray="0" />
  </svg>
);

export const SunIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
  </svg>
);

export const MoonIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7Z" />
  </svg>
);

export const SearchIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3.5 3.5" />
  </svg>
);

export const ChevronIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="m6 3.5 4.5 4.5L6 12.5" />
  </svg>
);

export const CheckIcon = (p: IconProps) => (
  <svg {...base} {...p} stroke-width="2.5">
    <path d="m3 8.5 3.5 3.5L13 4.5" />
  </svg>
);

export const MinusIcon = (p: IconProps) => (
  <svg {...base} {...p} stroke-width="2.5">
    <path d="M3.5 8h9" />
  </svg>
);

export const InfoIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 7.5V11.5" />
    <circle cx="8" cy="5" r="0.25" fill="currentColor" stroke-width="1" />
  </svg>
);

export const CATEGORY_ICONS = {
  apartments: BuildingIcon,
  food: FoodIcon,
  shopping: BagIcon,
  entertainment: TicketIcon,
} as const;
