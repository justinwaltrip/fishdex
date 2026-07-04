/**
 * Placeholder iNaturalist integration.
 *
 * When ready to wire up real data, replace these stubs with calls to:
 *   https://api.inaturalist.org/v1/observations
 *   https://api.inaturalist.org/v1/taxa/{id}
 *
 * Docs: https://api.inaturalist.org/v1/docs/
 *
 * Suggested surface:
 *  - fetchTaxonPhoto(taxonId)   -> Promise<{ url, attribution }>
 *  - fetchNearbyObservations(taxonId, lat, lng, radiusKm) -> Promise<Observation[]>
 *  - searchTaxa(query)          -> Promise<Taxon[]>
 */

export interface INaturalistObservation {
  id: number;
  observedOn: string;
  placeGuess: string;
  photoUrl: string;
  userLogin: string;
}

export interface INaturalistTaxonPhoto {
  url: string;
  attribution: string;
}

export async function fetchTaxonPhoto(
  _taxonId: number,
): Promise<INaturalistTaxonPhoto | null> {
  // TODO: GET https://api.inaturalist.org/v1/taxa/{taxonId}
  return null;
}

export async function fetchNearbyObservations(
  _taxonId: number,
  _lat: number,
  _lng: number,
  _radiusKm = 50,
): Promise<INaturalistObservation[]> {
  // TODO: GET https://api.inaturalist.org/v1/observations?taxon_id=&lat=&lng=&radius=
  return [];
}
