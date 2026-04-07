/* ===================================================================
   map.js  —  Core map logic (Leaflet init, shelter layer, GPS marker)
   Runs after location.js and disaster.js are loaded.
   =================================================================== */

(function () {
  'use strict';

  /* ---------- Service Worker Registration ---------- */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('sw.js')
      .then(function (reg) {
        console.log('[SW] Registered — scope:', reg.scope);
      })
      .catch(function (err) {
        console.warn('[SW] Registration failed:', err);
      });
  }

  /* ---------- Offline / Online Detection ---------- */
  var offlineBadge = document.getElementById('offline-badge');

  function updateOnlineStatus() {
    if (navigator.onLine) {
      offlineBadge.classList.add('hidden');
    } else {
      offlineBadge.classList.remove('hidden');
    }
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  /* ---------- Leaflet Map Init ---------- */
  var map = L.map('map', {
    center: [20.5937, 78.9629], // India center
    zoom: 5,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    maxZoom: 18,
  }).addTo(map);

  /* ---------- Shelter Layer ---------- */
  var shelterFeatures = []; // raw feature array, for nearest-shelter lookups

  var shelterIcon = L.divIcon({
    className: '',
    html: '<div class="shelter-marker">S</div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
  });

  fetch('data/shelters.geojson')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      shelterFeatures = data.features || [];

      L.geoJSON(data, {
        pointToLayer: function (feature, latlng) {
          return L.marker(latlng, { icon: shelterIcon });
        },
        onEachFeature: function (feature, layer) {
          var p = feature.properties || {};
          var html =
            '<div class="shelter-popup">' +
            '<h3>' + (p.name || 'Shelter') + '</h3>' +
            '<p><span class="label">Type:</span> ' + (p.type || '—') + '</p>' +
            '<p><span class="label">Capacity:</span> ' + (p.capacity || '—') + ' people</p>' +
            '<p><span class="label">District:</span> ' + (p.district || '—') + '</p>' +
            '</div>';
          layer.bindPopup(html);
        },
      }).addTo(map);
    })
    .catch(function (err) {
      console.warn('[Map] Could not load shelters.geojson', err);
    });

  /* ---------- Disaster Module Init ---------- */
  if (window.VortexDisaster) {
    window.VortexDisaster.init(map);
  }

  /* ---------- User Location Marker ---------- */
  var userMarker = null;
  var hasZoomedToUser = false;

  var userIcon = L.divIcon({
    className: '',
    html:
      '<div class="user-marker">' +
      '<div class="user-marker__pulse"></div>' +
      '<div class="user-marker__dot"></div>' +
      '</div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

  if (window.VortexLocation) {
    window.VortexLocation.onUpdate(function (pos) {
      // Update or create marker
      if (userMarker) {
        userMarker.setLatLng([pos.lat, pos.lng]);
      } else {
        userMarker = L.marker([pos.lat, pos.lng], { icon: userIcon, zIndexOffset: 999 }).addTo(map);
      }

      // Zoom to user on first fix (only if no disaster zone is active)
      if (!hasZoomedToUser) {
        hasZoomedToUser = true;
        if (!window.VortexDisaster || !window.VortexDisaster.activeType) {
          map.setView([pos.lat, pos.lng], 13, { animate: true });
        }
      }

      // Find nearest shelter
      var nearest = window.VortexLocation.findNearestShelter(shelterFeatures);
      var shelterInfo = document.getElementById('shelter-info');
      var shelterText = document.getElementById('shelter-text');

      if (nearest && shelterInfo && shelterText) {
        var name = nearest.feature.properties.name || 'Unknown shelter';
        var dist = nearest.distance;
        var distStr = dist < 1 ? (dist * 1000).toFixed(0) + ' m' : dist.toFixed(1) + ' km';

        shelterText.textContent = 'Nearest shelter: ' + name + ' — ' + distStr + ' away';
        shelterInfo.classList.remove('hidden');
      }
    });

    window.VortexLocation.start();
  }
})();
