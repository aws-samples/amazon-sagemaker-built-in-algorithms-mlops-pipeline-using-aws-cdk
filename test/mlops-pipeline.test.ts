import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as Pipeline from '../infra/stack/mlops/mlops-pipeline-stack';
import { AppContext } from '../lib/template/app-context';

test('Empty Stack', () => {
    const appContext = new AppContext({
        appConfigEnvName: 'APP_CONFIG'
    })

    // WHEN
    const stack = new Pipeline.MLOpsPipelineStack(appContext, {Name: 'PipelineStack'});
    
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
