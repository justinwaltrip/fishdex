export interface LocationBBox {
  name: string;
  nelat: number;
  nelng: number;
  swlat: number;
  swlng: number;
}

export const LOCATIONS: LocationBBox[] = [
  {
    name: "Cozumel",
    nelat: 20.65,
    nelng: -86.65,
    swlat: 20.22,
    swlng: -87.07,
  },
  {
    name: "Aruba",
    nelat: 12.87,
    nelng: -69.6,
    swlat: 12.22,
    swlng: -70.3,
  },
  {
    name: "Cayman Islands",
    nelat: 20.0,
    nelng: -79.45,
    swlat: 19.02,
    swlng: -81.7,
  },
  {
    name: "Isla Mujeres",
    nelat: 21.35,
    nelng: -86.65,
    swlat: 21.1,
    swlng: -86.85,
  },
  {
    name: "Key Largo",
    nelat: 25.31,
    nelng: -80.22,
    swlat: 24.9,
    swlng: -80.65,
  },
];

export function isInBBox(lat: number | null, lng: number | null, bbox: LocationBBox): boolean {
  if (lat == null || lng == null) return false;
  return lat <= bbox.nelat && lat >= bbox.swlat && lng <= bbox.nelng && lng >= bbox.swlng;
}
