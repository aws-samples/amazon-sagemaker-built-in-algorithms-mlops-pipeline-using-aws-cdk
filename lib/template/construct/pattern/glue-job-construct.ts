
/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { Construct } from 'constructs';
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3Deployment from "aws-cdk-lib/aws-s3-deployment";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as glue from 'aws-cdk-lib/aws-glue';

import { BaseConstruct, ConstructCommonProps } from '../base/base-construct';


export interface MLOpsPartsRoleProps extends ConstructCommonProps {
    baseName: string;
    projectPrefix: string;
    bucket: s3.Bucket;
    timeoutInMin: number;
    etlScriptFileName: string;
    etlScriptFilePath: string;
    etlScriptFileS3Key: string;
}

export class GlueJobConstruct extends BaseConstruct {

    public readonly role: iam.Role;
    public readonly job: glue.CfnJob;

    constructor(scope: Construct, id: string, props: MLOpsPartsRoleProps) {
        super(scope, id, props);

        this.role = new iam.Role(this, `${props.baseName}Role`, {
            roleName: `${props.projectPrefix}-${props.baseName}Role`,
            assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
        });
        this.role.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "s3:ListBucket",
                "s3:*Object"
            ],
            resources: [
                '*'
            ]
        }));

        new s3Deployment.BucketDeployment(this, "etl-scripts-deployment", {
            sources: [s3Deployment.Source.asset(props.etlScriptFilePath)],
            destinationBucket: props.bucket,
            destinationKeyPrefix: props.etlScriptFileS3Key
        });

        this.job = new glue.CfnJob(this, props.baseName, {
            name: `${props.projectPrefix}-${props.baseName}`,
            command: {
                name: 'glueetl',
                scriptLocation: `s3://${props.bucket.bucketName}/${props.etlScriptFileS3Key}/${props.etlScriptFileName}`,
                pythonVersion: '3',
            },
            role: this.role.roleArn,
            executionProperty: {
                maxConcurrentRuns: 2
            },
            defaultArguments: {
                '--job-language': 'python'
            },
            glueVersion: '2.0',
            workerType: 'Standard',
            numberOfWorkers: 2,
            timeout: props.timeoutInMin
        });
    }
}