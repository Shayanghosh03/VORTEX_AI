/* ===================================================================
   location.js  —  GPS / Geolocation handler
   Exposes: window.VortexLocation
   =================================================================== */

(function () {
  'use strict';

  var VortexLocation = {
    lat: null,
    lng: null,
    accuracy: null,
    watchId: null,
    callbacks: [],

    /** Register a callback for location updates: fn({ lat, lng, accuracy }) */
    onUpdate: function (fn) {
      this.callbacks.push(fn);
    },

    /** Notify all registered listeners */
    _notify: function () {
      var self = this;
      this.callbacks.forEach(function (fn) {
        fn({ lat: self.lat, lng: self.lng, accuracy: self.accuracy });
      });
    },

    /** Start watching position */
    start: function () {
      var self = this;
      var gpsText = document.getElementById('gps-text');

      if (!navigator.geolocation) {
        if (gpsText) gpsText.textContent = 'Geolocation not supported by this browser';
        return;
      }

      this.watchId = navigator.geolocation.watchPosition(
        function (pos) {
          self.lat = pos.coords.latitude;
          self.lng = pos.coords.longitude;
          self.accuracy = Math.round(pos.coords.accuracy);

          if (gpsText) {
            gpsText.textContent =
              'GPS: ' +
              self.lat.toFixed(4) +
              '°N, ' +
              self.lng.toFixed(4) +
              '°E  (±' +
              self.accuracy +
              ' m)';
          }

          self._notify();
        },
        function (err) {
          if (gpsText) {
            if (err.code === 1) {
              gpsText.textContent = 'Enable GPS to see your location and nearest shelter';
            } else {
              gpsText.textContent = 'GPS unavailable — ' + err.message;
            }
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 15000,
        }
      );
    },

    /** Stop watching */
    stop: function () {
      if (this.watchId !== null) {
        navigator.geolocation.clearWatch(this.watchId);
        this.watchId = null;
      }
    },

    /**
     * Haversine distance between two lat/lng points.
     * Returns distance in kilometres.
     */
    haversine: function (lat1, lon1, lat2, lon2) {
      var R = 6371; // km
      var dLat = ((lat2 - lat1) * Math.PI) / 180;
      var dLon = ((lon2 - lon1) * Math.PI) / 180;
      var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    },

    /**
     * Given an array of shelter features (GeoJSON), find the nearest one.
     * Returns { feature, distance } or null.
     */
    findNearestShelter: function (shelterFeatures) {
      if (!this.lat || !this.lng || !shelterFeatures || shelterFeatures.length === 0) {
        return null;
      }

      var self = this;
      var nearest = null;
      var minDist = Infinity;

      shelterFeatures.forEach(function (f) {
        var coords = f.geometry.coordinates; // [lng, lat]
        var d = self.haversine(self.lat, self.lng, coords[1], coords[0]);
        if (d < minDist) {
          minDist = d;
          nearest = f;
        }
      });

      return nearest ? { feature: nearest, distance: minDist } : null;
    },
  };

  window.VortexLocation = VortexLocation;
})();
