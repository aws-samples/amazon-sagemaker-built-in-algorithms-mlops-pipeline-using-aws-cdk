import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as cfn_inc from '@aws-cdk/cloudformation-include';

import * as base from './base/base-stack';
import { AppContext } from '../app-context';


export class CfnIncludeStack extends base.BaseStack {
    protected cfnTemplate: cfn_inc.CfnInclude;

    constructor(appContext: AppContext, stackConfig: any) {
        super(appContext, stackConfig);

        this.cfnTemplate = new cfn_inc.CfnInclude(this, 'cfn-template', {
            templateFile: stackConfig.TemplatePath,
        });

        for(let param of stackConfig.Parameters) {
            const paramEnv = this.cfnTemplate.getParameter(param.Key);
            paramEnv.default = param.Value;
        }

        // const paramEnv = cfnTemplate.getParameter('env');
        // paramEnv.default = 'dev';

        // const paramBucketName = cfnTemplate.getParameter('bucketName');
        // paramBucketName.default = 'cky-test-yyyyy01';
        

    }
}
