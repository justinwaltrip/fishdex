const BASE = "https://api.inaturalist.org/v1";

interface INaturalistPhoto {
  url: string;
  medium_url: string;
  large_url: string;
  square_url: string;
  attribution: string;
  license_code: string;
}

interface INaturalistTaxonResult {
  id: number;
  name: string;
  rank: string;
  preferred_common_name?: string;
  default_photo?: INaturalistPhoto & {
    original_dimensions?: { height: number; width: number };
  };
  taxon_photos?: { photo: INaturalistPhoto }[];
  ancestors?: { id: number; name: string; rank: string }[];
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

export interface TaxonSearchResult {
  id: number;
  name: string;
  rank: string;
  commonName?: string;
  photoUrl?: string;
  mediumPhotoUrl?: string;
  largePhotoUrl?: string;
  attribution?: string;
  licenseCode?: string;
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

export interface INaturalistTaxonPhoto {
  url: string;
  mediumUrl: string;
  largeUrl: string;
  attribution: string;
  licenseCode: string;
  commonName?: string;
  scientificName: string;
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

export async function searchTaxa(query: string): Promise<TaxonSearchResult[]> {
  const params = new URLSearchParams({ q: query, per_page: "5" });
  const res = await fetch(`${BASE}/taxa?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  const results: INaturalistTaxonResult[] = data.results ?? [];
  return results.map(mapTaxonResult);
}

function mapTaxonResult(t: INaturalistTaxonResult): TaxonSearchResult {
  const photo = t.default_photo;
  return {
    id: t.id,
    name: t.name,
    rank: t.rank,
    commonName: t.preferred_common_name,
    photoUrl: photo?.square_url ?? photo?.url,
    mediumPhotoUrl: photo?.medium_url ?? photo?.url,
    largePhotoUrl: photo?.large_url ?? photo?.url,
    attribution: photo?.attribution,
    licenseCode: photo?.license_code,
  };
}

export async function fetchAllUserObservations(
  userLogin: string,
): Promise<UserObservation[]> {
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

    const res = await fetch(`${BASE}/observations?${params}`);
    if (!res.ok) break;

    const data = await res.json();
    const results: INaturalistObservationResult[] = data.results ?? [];

    for (const obs of results) {
      const photo = obs.photos?.[0];
      all.push({
        id: obs.id,
        observedAt: obs.time_observed_at ?? obs.observed_on ?? "",
        placeGuess: obs.place_guess ?? "Unknown location",
        photoUrl: photo ? photo.square_url ?? photo.url : null,
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
  }

  return all;
}

export async function fetchTaxonPhoto(
  taxonId: number,
): Promise<INaturalistTaxonPhoto | null> {
  const res = await fetch(`${BASE}/taxa/${taxonId}`);
  if (!res.ok) return null;
  const data = await res.json();
  const taxon: INaturalistTaxonResult | undefined = data.results?.[0];
  if (!taxon) return null;

  const photo = taxon.default_photo;
  if (!photo) return null;

  return {
    url: photo.square_url ?? photo.url,
    mediumUrl: photo.medium_url ?? photo.url,
    largeUrl: photo.large_url ?? photo.url,
    attribution: photo.attribution,
    licenseCode: photo.license_code,
    commonName: taxon.preferred_common_name,
    scientificName: taxon.name,
  };
}

export async function fetchRecentObservations(
  taxonId: number,
  limit = 5,
): Promise<INaturalistObservation[]> {
  const params = new URLSearchParams({
    taxon_id: String(taxonId),
    per_page: String(limit),
    order: "desc",
    order_by: "observed_on",
    photos: "true",
    verifiable: "true",
  });

  const results = await fetchObservationsPage(params);
  return results.map(mapObservation);
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

async function fetchObservationsPage(params: URLSearchParams): Promise<INaturalistObservationResult[]> {
  const res = await fetch(`${BASE}/observations?${params}`);
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
    photoUrl: photo ? photo.square_url ?? photo.url : null,
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



