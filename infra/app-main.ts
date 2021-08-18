#!/usr/bin/env node
import { AppContext } from '../lib/template/app-context';

import { MLOpsPipelineStack } from './stack/mlops/mlops-pipeline-stack'


const appContext = new AppContext({
    appConfigEnvName: 'APP_CONFIG',
});

if (appContext.stackCommonProps != undefined) {
    new MLOpsPipelineStack(appContext, appContext.appConfig.Stack.ChurnXgboostPipeline);
} else {
    console.error('[Error] wrong AppConfigFile');
}
