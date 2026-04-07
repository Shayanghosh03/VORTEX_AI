/* ===================================================================
   disaster.js  —  Disaster zone layer management + route display
   Exposes: window.VortexDisaster
   =================================================================== */

(function () {
  'use strict';

  var ZONE_STYLES = {
    earthquake: { color: '#e74c3c', fillColor: '#e74c3c', fillOpacity: 0.35, weight: 2 },
    cyclone:    { color: '#e67e22', fillColor: '#e67e22', fillOpacity: 0.35, weight: 2 },
    flood:      { color: '#3498db', fillColor: '#3498db', fillOpacity: 0.35, weight: 2 },
  };

  var ROUTE_STYLE = {
    color: '#27ae60',
    weight: 4,
    opacity: 0.9,
    dashArray: '10, 8',
  };

  var VortexDisaster = {
    map: null,
    activeType: null,
    zoneLayer: null,
    routeLayer: null,
    routesData: null,    // full routes.geojson parsed
    zonesCache: {},      // { earthquake: geojson, cyclone: geojson, flood: geojson }

    /** Initialise — call once after map is ready */
    init: function (leafletMap) {
      this.map = leafletMap;
      this._bindButtons();
      this._loadRoutes();
    },

    /** Bind the 3 disaster buttons */
    _bindButtons: function () {
      var self = this;
      var buttons = document.querySelectorAll('.disaster-btn');

      buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var type = btn.getAttribute('data-type');

          // Toggle off if already active
          if (self.activeType === type) {
            self._clearLayers();
            self.activeType = null;
            btn.classList.remove('active');
            return;
          }

          // Deactivate all buttons
          buttons.forEach(function (b) { b.classList.remove('active'); });

          // Activate this one
          btn.classList.add('active');
          self.activeType = type;
          self._loadZone(type);
        });
      });
    },

    /** Fetch and cache routes.geojson */
    _loadRoutes: function () {
      var self = this;
      fetch('data/routes.geojson')
        .then(function (res) { return res.json(); })
        .then(function (data) { self.routesData = data; })
        .catch(function (err) { console.warn('[Disaster] Could not load routes.geojson', err); });
    },

    /** Load a specific disaster zone GeoJSON */
    _loadZone: function (type) {
      var self = this;
      var file = 'data/zones_' + type + '.geojson';

      // Use cache if available
      if (this.zonesCache[type]) {
        this._renderZone(type, this.zonesCache[type]);
        return;
      }

      fetch(file)
        .then(function (res) { return res.json(); })
        .then(function (data) {
          self.zonesCache[type] = data;
          self._renderZone(type, data);
        })
        .catch(function (err) { console.warn('[Disaster] Could not load ' + file, err); });
    },

    /** Render zone polygons + matching routes */
    _renderZone: function (type, geojson) {
      this._clearLayers();

      var style = ZONE_STYLES[type] || ZONE_STYLES.earthquake;

      // Zone polygons
      this.zoneLayer = L.geoJSON(geojson, {
        style: function () { return style; },
        onEachFeature: function (feature, layer) {
          if (feature.properties && feature.properties.name) {
            layer.bindTooltip(feature.properties.name, {
              className: 'route-tooltip',
              sticky: true,
            });
          }
        },
      }).addTo(this.map);

      // Escape routes for this disaster type
      if (this.routesData) {
        var filtered = {
          type: 'FeatureCollection',
          features: this.routesData.features.filter(function (f) {
            return f.properties && f.properties.disaster_type === type;
          }),
        };

        if (filtered.features.length > 0) {
          this.routeLayer = L.geoJSON(filtered, {
            style: function () { return ROUTE_STYLE; },
            onEachFeature: function (feature, layer) {
              if (feature.properties && feature.properties.route_name) {
                layer.bindTooltip(
                  '🛤 ' + feature.properties.route_name,
                  { className: 'route-tooltip', sticky: true }
                );
              }
            },
          }).addTo(this.map);
          this.routeLayer.bringToFront();
        }
      }

      // Fit map to zone bounds
      if (this.zoneLayer.getBounds().isValid()) {
        this.map.fitBounds(this.zoneLayer.getBounds(), { padding: [40, 40] });
      }
    },

    /** Remove current zone + route layers */
    _clearLayers: function () {
      if (this.zoneLayer) {
        this.map.removeLayer(this.zoneLayer);
        this.zoneLayer = null;
      }
      if (this.routeLayer) {
        this.map.removeLayer(this.routeLayer);
        this.routeLayer = null;
      }
    },
  };

  window.VortexDisaster = VortexDisaster;
})();
