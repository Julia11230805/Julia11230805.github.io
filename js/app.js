/* re:poem — tiny module registry.
   Classic scripts (not ES modules) so the site runs straight off the
   filesystem by double-clicking index.html — <script type="module"> is
   blocked by CORS on file://. Each file in js/modules/ registers itself
   here and owns one job.                                                    */

(function (global) {
  'use strict';

  var registry = [];
  var apis = {};
  var booted = false;

  var RePoem = {
    /**
     * Register a module.
     * @param {string} name
     * @param {function(object): (object|void)} init  runs at boot, may return an api
     */
    module: function (name, init) {
      registry.push({ name: name, init: init });
      return RePoem;
    },

    /** Reach an already-booted module by name. */
    use: function (name) {
      return apis[name] || null;
    },

    /** Start every registered module, in registration order. */
    boot: function () {
      if (booted) return;
      booted = true;

      registry.forEach(function (entry) {
        try {
          var api = entry.init(RePoem);
          apis[entry.name] = api || null;
        } catch (err) {
          // one broken module must not take the cover down with it
          console.error('[re:poem] module "' + entry.name + '" failed to start', err);
        }
      });

      document.documentElement.classList.add('is-booted');
    },

    /** Small shared helper: throttle a handler to one call per animation frame. */
    onFrame: function (fn) {
      var queued = false;
      return function () {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () {
          queued = false;
          fn();
        });
      };
    },

    reducedMotion: function () {
      return global.matchMedia
        ? global.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    }
  };

  global.RePoem = RePoem;
})(window);
