import { absolute } from '@codesandbox/common/lib/utils/path';
import getDefinition from '@codesandbox/common/lib/templates/index';
import parseConfigurations from '@codesandbox/common/lib/templates/configuration/parse';
import { loadDependencies } from 'sandpack-core/lib/npm';

import { getDependencies, getHTMLParts, initializeManager } from './compile';
import handleExternalResources from './external-resources';

export default async (data, firstLoad) => {
  console.log('injectTranspiledModules -> STARTED', data); // eslint-disable-line no-console
  const templateDefinition = getDefinition(data.template);
  const configurations = parseConfigurations(
    data.template,
    templateDefinition.configurationFiles,
    path => data.modules[path]
  );
  if (!window.manager) {
    window.manager = await initializeManager(
      data.$id,
      data.template,
      data.modules,
      configurations,
      {
        hasFileResolver: data.hasFileResolver,
        customNpmRegistries: [],
        reactDevTools: data.reactDevTools,
      }
    );
    console.log('injectTranspiledModules -> MANAGER INITIALISED'); // eslint-disable-line no-console
  } else {
    console.log('injectTranspiledModules -> USING EXISTING MANAGER'); // eslint-disable-line no-console
  }
  const transpiledModuleInstances = Object.keys(data.transpiledModules).map(
    transpiledModuleKey => {
      const transpiledModule = data.transpiledModules[transpiledModuleKey];
      const transpiledModuleInstance = window.manager.addTranspiledModule(
        transpiledModule.module,
        transpiledModule.query
      );
      transpiledModuleInstance.source = transpiledModule.source;
      return transpiledModuleInstance;
    }
  );
  console.log('injectTranspiledModules -> MODULES ADDED TO MANAGER'); // eslint-disable-line no-console
  const parsedPackageJSON = configurations.package.parsed;
  let dependencies = getDependencies(
    parsedPackageJSON,
    templateDefinition,
    configurations
  );
  dependencies = await window.manager.preset.processDependencies(dependencies);
  const { manifest, isNewCombination } = await loadDependencies(
    dependencies,
    ({ done, total, remainingDependencies }) => {},
    {
      disableExternalConnection: data.disableDependencyPreprocessing,
      resolutions: parsedPackageJSON.resolutions,
    }
  );
  const shouldReloadManager = isNewCombination && !firstLoad;
  if (shouldReloadManager) {
    window.manager.dispose();
    window.manager = await initializeManager(
      data.$id,
      data.template,
      data.modules,
      configurations,
      {
        hasFileResolver: data.hasFileResolver,
        reactDevTools: data.reactDevTools,
      }
    );
  }
  if (shouldReloadManager || firstLoad) {
    window.manager.setManifest(manifest);
  }
  console.log('injectTranspiledModules -> DEPENDENCIES LOADED'); // eslint-disable-line no-console
  await window.manager.preset.preEvaluate(
    window.manager,
    transpiledModuleInstances
  );
  const htmlEntries = templateDefinition.getHTMLEntries(configurations);
  const htmlModulePath = htmlEntries.find(p => Boolean(data.modules[p]));
  const htmlModule = data.modules[htmlModulePath];
  let html =
    data.template === 'vue-cli'
      ? '<div id="app"></div>'
      : '<div id="root"></div>';
  if (htmlModule && htmlModule.code) {
    html = htmlModule.code;
  }
  const { body } = getHTMLParts(html);
  document.body.innerHTML = body;
  console.log('injectTranspiledModules -> HTML INJECTED'); // eslint-disable-line no-console
  await handleExternalResources(data.externalResources);
  console.log('injectTranspiledModules -> EXTERNAL RESOURCES INJECTED'); // eslint-disable-line no-console
  const possibleEntries = templateDefinition.getEntries(configurations);
  const foundMain = possibleEntries.find(p => Boolean(data.modules[p]));
  const main = absolute(foundMain);
  const managerModuleToTranspile = data.modules[main];
  window.manager.evaluateModule(managerModuleToTranspile, {
    force: false,
  });
  console.log('injectTranspiledModules -> MODULES EVALUATED'); // eslint-disable-line no-console
  await window.manager.preset.teardown(
    window.manager,
    transpiledModuleInstances
  );
  console.log('injectTranspiledModules -> DONE'); // eslint-disable-line no-console
};
