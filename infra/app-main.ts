#!/usr/bin/env node
import { AppContext, AppContextError } from '../lib/template/app-context';

import { MLOpsPipelineStack } from './stack/mlops/mlops-pipeline-stack'


try {
    const appContext = new AppContext({
        appConfigFileKey: 'APP_CONFIG',
    });

    new MLOpsPipelineStack(appContext, appContext.appConfig.Stack.ChurnXgboostPipeline);
} catch (error) {
    if (error instanceof AppContextError) {
        console.error('[AppContextError]:', error.message);
    } else {
        console.error('[Error]: not-handled-error', error);
    }
}