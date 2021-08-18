import cdk = require("@aws-cdk/core");
import * as s3 from "@aws-cdk/aws-s3";
import * as s3Deployment from "@aws-cdk/aws-s3-deployment";
import * as iam from '@aws-cdk/aws-iam';
import * as glue from '@aws-cdk/aws-glue';

export interface MLOpsPartsRoleProps {
    baseName: string;
    projectPrefix: string;
    bucket: s3.Bucket;
    timeoutInMin: number;
    etlScriptFileName: string;
    etlScriptFilePath: string;
    etlScriptFileS3Key: string;
}

export class GlueJobConstruct extends cdk.Construct {

    public readonly role: iam.Role;
    public readonly job: glue.CfnJob;

    constructor(scope: cdk.Construct, id: string, props: MLOpsPartsRoleProps) {
        super(scope, id);

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