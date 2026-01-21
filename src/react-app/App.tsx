import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";

function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [showContours, setShowContours] = useState(true);
  const [showHillshade, setShowHillshade] = useState(true);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          hillshade: {
            type: "vector",
            tiles: [window.location.origin + "/tiles/hillshade/{z}/{x}/{y}.mvt"],
            minzoom: 1,
            maxzoom: 15,
          },
          contour: {
            type: "vector",
            tiles: [window.location.origin + "/tiles/contour/{z}/{x}/{y}.mvt"],
            minzoom: 1,
            maxzoom: 15,
          },
        },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#c9c4bc" },
          },
          {
            id: "hillshade-shadow",
            type: "fill",
            source: "hillshade",
            "source-layer": "hillshade",
            filter: ["<", ["get", "shade"], 0.5],
            layout: { visibility: "visible" },
            paint: {
              "fill-color": "#3d3224",
              "fill-opacity": [
                "interpolate",
                ["linear"],
                ["get", "shade"],
                0, 0.6,
                0.5, 0,
              ],
              "fill-antialias": false,
            },
          },
          {
            id: "hillshade-highlight",
            type: "fill",
            source: "hillshade",
            "source-layer": "hillshade",
            filter: [">=", ["get", "shade"], 0.5],
            layout: { visibility: "visible" },
            paint: {
              "fill-color": "#fffff0",
              "fill-opacity": [
                "interpolate",
                ["linear"],
                ["get", "shade"],
                0.5, 0,
                1, 0.5,
              ],
              "fill-antialias": false,
            },
          },
          {
            id: "contour-lines",
            type: "line",
            source: "contour",
            "source-layer": "contour",
            filter: ["==", ["get", "index"], false],
            layout: { visibility: "visible" },
            paint: {
              "line-color": "#6b5d4d",
              "line-width": 0.6,
              "line-opacity": 0.4,
            },
          },
          {
            id: "contour-index",
            type: "line",
            source: "contour",
            "source-layer": "contour",
            filter: ["==", ["get", "index"], true],
            layout: { visibility: "visible" },
            paint: {
              "line-color": "#5a4d3f",
              "line-width": 1,
              "line-opacity": 0.5,
            },
          },
        ],
      },
      center: [7.45, 46.95],
      zoom: 12,
    });

    map.current.addControl(new maplibregl.NavigationControl(), "top-right");
    map.current.addControl(new maplibregl.ScaleControl(), "bottom-left");

    map.current.on("load", () => setMapLoaded(true));

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  const setVisibility = useCallback((layerId: string, visible: boolean) => {
    map.current?.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }, []);

  useEffect(() => {
    if (!mapLoaded) return;
    setVisibility("hillshade-shadow", showHillshade);
    setVisibility("hillshade-highlight", showHillshade);
  }, [mapLoaded, showHillshade, setVisibility]);

  useEffect(() => {
    if (!mapLoaded) return;
    setVisibility("contour-lines", showContours);
    setVisibility("contour-index", showContours);
  }, [mapLoaded, showContours, setVisibility]);

  return (
    <div className="app">
      <div ref={mapContainer} className="map-container" />
      <div className="controls">
        <h3>Vector Elevation Model</h3>
        <label>
          <input
            type="checkbox"
            checked={showContours}
            onChange={(e) => setShowContours(e.target.checked)}
          />
          Vector Contours
        </label>
        <label>
          <input
            type="checkbox"
            checked={showHillshade}
            onChange={(e) => setShowHillshade(e.target.checked)}
          />
          Vector Hillshade
        </label>
      </div>
    </div>
  );
}

export default App;
