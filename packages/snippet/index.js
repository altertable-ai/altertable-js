(() => {
  const METHODS = ['init', 'track', 'page', 'identify'];

  const createStubMethod = (targetObject, methodName) => {
    targetObject[methodName] = function () {
      targetObject.push(
        [methodName].concat(Array.prototype.slice.call(arguments))
      );
    };
  };

  ((document, instance) => {
    if (!instance._initialized) {
      // eslint-disable-next-line no-undef
      window.Altertable = instance;

      instance.init = function (apiKey, config) {
        const scriptElement = document.createElement('script');
        scriptElement.type = 'text/javascript';
        scriptElement.async = true;
        scriptElement.src = config.baseUrl + '/altertable.js';

        const firstScript = document.getElementsByTagName('script')[0];
        firstScript.parentNode.insertBefore(scriptElement, firstScript);

        for (let i = 0; i < METHODS.length; i++) {
          createStubMethod(instance, METHODS[i]);
        }

        instance.push(['init', apiKey, config]);
      };

      instance._initialized = 1;
    }
    // eslint-disable-next-line no-undef
  })(document, window.Altertable || []);

  // eslint-disable-next-line no-undef
  window.Altertable.init('%ALTERTABLE_API_KEY%', {
    baseUrl: '%ALTERTABLE_API_URL%',
    environment: '%ALTERTABLE_ENVIRONMENT%',
  });
})();
