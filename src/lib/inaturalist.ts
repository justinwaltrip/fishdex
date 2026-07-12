const BASE = "https://api.inaturalist.org/v1";

const USER_AGENT_CONTACT = import.meta.env.VITE_INATURALIST_USERAGENT_CONTACT
  ? ` (${import.meta.env.VITE_INATURALIST_USERAGENT_CONTACT})`
  : "";
const USER_AGENT = `Fishdex/1.0${USER_AGENT_CONTACT}`;

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      "User-Agent": USER_AGENT,
      ...init?.headers,
    },
  });
}

interface INaturalistPhoto {
  url: string;
  medium_url: string;
  large_url: string;
  square_url: string;
  attribution: string;
  license_code: string;
}

interface INaturalistUser {
  login: string;
  name?: string;
}

interface INaturalistObservationResult {
  id: number;
  species_guess?: string;
  observed_on?: string;
  time_observed_at?: string;
  place_guess?: string;
  description?: string;
  location?: string;
  photos: (INaturalistPhoto & { id: number })[];
  user: INaturalistUser;
  taxon: {
    id: number;
    name: string;
    iconic_taxon_id?: number;
    preferred_common_name?: string;
    default_photo?: INaturalistPhoto & {
      original_dimensions?: { height: number; width: number };
    };
  };
}

export interface UserObservation {
  id: number;
  observedAt: string;
  placeGuess: string;
  photoUrl: string | null;
  taxonId: number;
  taxonName: string;
  taxonRank: string;
  commonName?: string;
  speciesGuess?: string;
  description?: string;
  iconicTaxonId: number;
}

export interface ObservedSpecies {
  taxonId: number;
  scientificName: string;
  commonName: string;
  photoUrl: string | null;
  userObsCount: number;
  caribbeanObsCount: number;
  rarity: "common" | "uncommon" | "rare" | "legendary" | "unknown";
  group: string;
  taxonRank: string;
  latestObservedAt: string;
  latestPlaceGuess: string;
  latestObservationId: number;
}

export interface CaribbeanSpecies {
  taxonId: number;
  scientificName: string;
  commonName: string;
  photoUrl: string | null;
  caribbeanObsCount: number;
  rarity: "common" | "uncommon" | "rare" | "legendary";
  group: string;
}

export interface INaturalistObservation {
  id: number;
  observedAt: string;
  placeGuess: string;
  photoUrl: string | null;
  userLogin: string;
  speciesGuess?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
}

export async function fetchAllUserObservations(userLogin: string): Promise<UserObservation[]> {
  const all: UserObservation[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const params = new URLSearchParams({
      user_login: userLogin,
      per_page: String(perPage),
      page: String(page),
      order: "desc",
      order_by: "observed_on",
    });

    const res = await apiFetch(`${BASE}/observations?${params}`);
    if (!res.ok) break;

    const data = await res.json();
    const results: INaturalistObservationResult[] = data.results ?? [];

    for (const obs of results) {
      const photo = obs.photos?.[0];
      all.push({
        id: obs.id,
        observedAt: obs.time_observed_at ?? obs.observed_on ?? "",
        placeGuess: obs.place_guess ?? "Unknown location",
        photoUrl: photo ? (photo.square_url ?? photo.url) : null,
        taxonId: obs.taxon.id,
        taxonName: obs.taxon.name,
        taxonRank: obs.taxon.default_photo ? "species" : "unknown",
        commonName: obs.taxon.preferred_common_name,
        speciesGuess: obs.species_guess,
        description: obs.description,
        iconicTaxonId: obs.taxon.iconic_taxon_id ?? 0,
      });
    }

    if (results.length < perPage) break;
    page++;
    await new Promise((r) => setTimeout(r, 200));
  }

  return all;
}

export async function fetchUserObservations(
  taxonId: number,
  userLogin: string,
  limit = 5,
): Promise<INaturalistObservation[]> {
  const params = new URLSearchParams({
    taxon_id: String(taxonId),
    user_login: userLogin,
    per_page: String(limit),
    order: "desc",
    order_by: "observed_on",
  });

  const results = await fetchObservationsPage(params);
  return results.map(mapObservation);
}

async function fetchObservationsPage(
  params: URLSearchParams,
): Promise<INaturalistObservationResult[]> {
  const res = await apiFetch(`${BASE}/observations?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results ?? [];
}

function mapObservation(obs: INaturalistObservationResult): INaturalistObservation {
  const photo = obs.photos?.[0];
  return {
    id: obs.id,
    observedAt: obs.time_observed_at ?? obs.observed_on ?? "",
    placeGuess: obs.place_guess ?? "Unknown location",
    photoUrl: photo ? (photo.square_url ?? photo.url) : null,
    userLogin: obs.user.login,
    speciesGuess: obs.species_guess,
    description: obs.description,
    latitude: parseCoords(obs.location)?.[0],
    longitude: parseCoords(obs.location)?.[1],
  };
}

function parseCoords(location: string | undefined): [number, number] | null {
  if (!location) return null;
  const parts = location.split(",");
  if (parts.length !== 2) return null;
  const lat = Number.parseFloat(parts[0]);
  const lng = Number.parseFloat(parts[1]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return [lat, lng];
}
