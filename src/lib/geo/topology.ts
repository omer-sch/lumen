"use client";

import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Topology, GeometryCollection } from "topojson-specification";

export type CountryFeature = Feature<Geometry, { name?: string }>;
export type CountryFeatureCollection = FeatureCollection<Geometry, { name?: string }>;

/**
 * Cached resolver for the world-atlas TopoJSON. The module-level
 * promise means the first ChoroplethMap mount kicks off the network +
 * parse work, every subsequent mount reuses the same parsed features
 * (the TopoJSON is ~100kb gzipped — parsing once is the right call).
 *
 * Dynamic import keeps the JSON out of the main bundle; it only ships
 * to clients that actually land on /campaigns/geo.
 */
let cached: Promise<CountryFeatureCollection> | null = null;

export function loadCountriesTopology(): Promise<CountryFeatureCollection> {
  if (cached) return cached;
  cached = (async () => {
    const [{ feature }, topoModule] = await Promise.all([
      import("topojson-client"),
      import("world-atlas/countries-110m.json"),
    ]);
    // TopoJSON's static-import type is too narrow to satisfy the
    // topojson-specification interfaces (transform tuples become
    // generic arrays), so funnel through `unknown` to bridge them.
    const topology = (topoModule.default ?? topoModule) as unknown as Topology;
    const countries = topology.objects.countries as GeometryCollection;
    const fc = feature(topology, countries) as unknown as CountryFeatureCollection;
    return fc;
  })().catch((err) => {
    // Reset the cache so a transient failure (e.g. offline reload)
    // can retry on the next mount instead of being stuck on a
    // rejected promise forever.
    cached = null;
    throw err;
  });
  return cached;
}
