import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as lambda from '@aws-cdk/aws-lambda';
import * as lambda_event from '@aws-cdk/aws-lambda-event-sources';
import * as glue from '@aws-cdk/aws-glue';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';

import * as base from '../../../lib/template/stack/base/base-stack';
import { AppContext } from '../../../lib/template/app-context';

import { GlueJobConstruct } from '../../../lib/template/pattern/glue-job-construct';

interface MLOpsPipelineConfig {
    EndpointName: string;

    GlueJobFilePath: string;
    GlueJobTimeoutInMin: number;

    TrainContainerImage: string;
    TrainParameters: any;
    TrainInputContent: string;
    TrainInstanceType: string;

    ModelValidationEnable: boolean;
    ModelErrorThreshold: number;

    EndpointInstanceType: string;
    EndpointInstanceCount: number;
}

interface StateMachineProps {
    statemachineName: string;
    statemachineRole: iam.Role;

    bucket: s3.Bucket;

    glueJob: glue.CfnJob;
    glueJobTimeoutInMin: number;

    trainContainerImage: string;
    trainParameters: any;
    trainInputContent: string;
    trainInstanceType: ec2.InstanceType;
    trainJobRole: iam.Role;

    modelErrorThreshold: number;

    endpointInstanceType: ec2.InstanceType;
    endpointInstanceCount: number;

    queryEndpointLambda: lambda.Function;
    queryAccuracyLambda?: lambda.Function;
}

export class MLOpsPipelineStack extends base.BaseStack {
    private readonly bucketKeyForInput: string = 'input';
    private readonly bucketKeyForOutput: string = 'output';
    private readonly bucketKeyforGlueCode: string = 'code/glue';

    constructor(appContext: AppContext, stackConfig: any) {
        super(appContext, stackConfig);

        const pipelineConfig = stackConfig as MLOpsPipelineConfig;

        const baseName = pipelineConfig.EndpointName;

        const bucket = this.createS3Bucket(baseName);

        const stateMachine = this.createStateMachine({
                statemachineName: baseName,
                statemachineRole: this.createStateMachineRole(baseName),

                bucket: bucket,

                glueJob: this.createGlueEtl(baseName, bucket, pipelineConfig.GlueJobFilePath, pipelineConfig.GlueJobTimeoutInMin),
                glueJobTimeoutInMin: pipelineConfig.GlueJobTimeoutInMin,

                trainInputContent: pipelineConfig.TrainInputContent,
                trainParameters: pipelineConfig.TrainParameters,
                trainJobRole: this.createSageMakerTrainingRole(baseName),
                trainInstanceType: this.findInstanceType(pipelineConfig.TrainInstanceType),
                trainContainerImage: pipelineConfig.TrainContainerImage,

                modelErrorThreshold: pipelineConfig.ModelErrorThreshold,

                endpointInstanceCount: pipelineConfig.EndpointInstanceCount,
                endpointInstanceType: this.findInstanceType(pipelineConfig.EndpointInstanceType),

                queryAccuracyLambda: pipelineConfig.ModelValidationEnable ? this.createQueryAccuracyLambda(baseName) : undefined,
                queryEndpointLambda: this.createQueryEndpointLambda(baseName),
            });

        this.createTriggerStateMachineLambda(baseName, bucket, stateMachine);
    }

    private findInstanceType(instanceClassDotSizeInString: string): ec2.InstanceType {
        const tempArray = instanceClassDotSizeInString.split('.');
        
        const instanceClass = this.findEnumType(ec2.InstanceClass, tempArray[0]);
        const instanceSize = this.findEnumType(ec2.InstanceSize, tempArray[1]);

        return ec2.InstanceType.of(instanceClass, instanceSize);
    }

    private createStateMachine(props: StateMachineProps): sfn.StateMachine {
        const startState = new sfn.Pass(this, `Start`);
        const finishState = new sfn.Pass(this, `Finish`);

        const etlState = new tasks.GlueStartJobRun(this, `Glue ETL`, {
            glueJobName: props.glueJob.name!,
            arguments: sfn.TaskInput.fromJsonPathAt('$.PreprocessGlue'),
            timeout: cdk.Duration.minutes(props.glueJobTimeoutInMin),
            notifyDelayAfter: cdk.Duration.minutes(1),
            integrationPattern: sfn.IntegrationPattern.RUN_JOB,
            resultPath: '$.Result',
        });

        const trainingState = new tasks.SageMakerCreateTrainingJob(this, `Train Model`, {
            trainingJobName: sfn.JsonPath.stringAt('$.TrainSageMaker.TrainingJobName'), // `${this.props.projectFullName}-PartsRecommendationTrainingJob`,// 이전 state에 전달 받고 싶다면 ==> sfn.JsonPath.stringAt('$.TrainingJobName'),
            role: props.trainJobRole,
            algorithmSpecification: {
                trainingImage: tasks.DockerImage.fromRegistry(props.trainContainerImage),
                trainingInputMode: tasks.InputMode.FILE,
            },
            hyperparameters: props.trainParameters,
            inputDataConfig: [
                {
                    channelName: 'train',
                    contentType: props.trainInputContent,
                    dataSource: {
                        s3DataSource: {
                            s3Location: tasks.S3Location.fromJsonExpression('$.TrainSageMaker.TrainData'), //ToDo Change
                            s3DataDistributionType: tasks.S3DataDistributionType.SHARDED_BY_S3_KEY,
                        },
                    },
                },
                {
                    channelName: 'validation',
                    contentType: props.trainInputContent,
                    dataSource: {
                        s3DataSource: {
                            s3Location: tasks.S3Location.fromJsonExpression('$.TrainSageMaker.ValidateData'), //ToDo Change
                            s3DataDistributionType: tasks.S3DataDistributionType.SHARDED_BY_S3_KEY,
                        },
                    },
                }
            ],
            outputDataConfig: {
                s3OutputLocation: tasks.S3Location.fromJsonExpression('$.TrainSageMaker.TrainOutput'),
            },
            resourceConfig: {
                instanceCount: 1,
                instanceType: props.trainInstanceType,
                volumeSize: cdk.Size.gibibytes(50),
            },
            stoppingCondition: {
                maxRuntime: cdk.Duration.hours(1),
            },
            integrationPattern: sfn.IntegrationPattern.RUN_JOB,
            resultPath: '$.Result',
        });

        const createModelState = new tasks.SageMakerCreateModel(this, `Create Model`, {
            modelName: sfn.JsonPath.stringAt('$.ServeSageMaker.ModelName'),
            primaryContainer: new tasks.ContainerDefinition({
                image: tasks.DockerImage.fromJsonExpression(sfn.JsonPath.stringAt('$.Result.AlgorithmSpecification.TrainingImage')),
                mode: tasks.Mode.SINGLE_MODEL,
                modelS3Location: tasks.S3Location.fromJsonExpression('$.Result.ModelArtifacts.S3ModelArtifacts'),
            }),
            resultPath: '$.Result',
        });

        let queryAccuracyState = undefined;
        if (props.queryAccuracyLambda != undefined) {
            queryAccuracyState = new tasks.LambdaInvoke(this, `Query Accuracy`, {
                lambdaFunction: props.queryAccuracyLambda,
                resultPath: '$.Result',
            });
        }

        const configeEndpointState = new tasks.SageMakerCreateEndpointConfig(this, `Config Endpoint`, {
            endpointConfigName: sfn.JsonPath.stringAt('$.ServeSageMaker.EndpointConfigName'),
            productionVariants: [{
                initialInstanceCount: props.endpointInstanceCount,
                instanceType: props.endpointInstanceType,
                modelName: sfn.JsonPath.stringAt('$.ServeSageMaker.ModelName'),
                variantName: 'variant1',
            }],
            resultPath: '$.Result',
        });

        let choiceAccuracyConditionState = undefined;
        if (props.queryAccuracyLambda != undefined) {
            choiceAccuracyConditionState = new sfn.Choice(this, `Accuracy higher(${props.modelErrorThreshold})?`)
                .when(sfn.Condition.numberLessThan('$.Result.Payload.Metrics[0].Value', props.modelErrorThreshold), configeEndpointState)
                .otherwise(finishState);
        }

        const queryEndpointState = new tasks.LambdaInvoke(this, `Query Endpoint`, {
            lambdaFunction: props.queryEndpointLambda,
            resultPath: '$.Result',
        });

        const createEndpointState = new tasks.SageMakerCreateEndpoint(this, `Create Endpoint`, {
            endpointName: sfn.JsonPath.stringAt('$.ServeSageMaker.EndpointName'),
            endpointConfigName: sfn.JsonPath.stringAt('$.ServeSageMaker.EndpointConfigName'),
            resultPath: '$.Result',
        });

        const uddateEndpointState = new tasks.SageMakerUpdateEndpoint(this, `Update Endpoint`, {
            endpointName: sfn.JsonPath.stringAt('$.ServeSageMaker.EndpointName'),
            endpointConfigName: sfn.JsonPath.stringAt('$.ServeSageMaker.EndpointConfigName'),
        });

        const choiceExistentConditionState = new sfn.Choice(this, 'Endpoint Existent?')
            .when(sfn.Condition.stringEquals('$.Result.Payload.Existent', 'TRUE'), uddateEndpointState)
            .otherwise(createEndpointState);

        startState.next(etlState);
        etlState.next(trainingState);
        trainingState.next(createModelState);

        if (queryAccuracyState != undefined && choiceAccuracyConditionState != undefined) {
            createModelState.next(queryAccuracyState);
            queryAccuracyState.next(choiceAccuracyConditionState);
            configeEndpointState.next(queryEndpointState);
            queryEndpointState.next(choiceExistentConditionState);
            choiceExistentConditionState.afterwards().next(finishState);
        } else {
            createModelState.next(configeEndpointState);
            configeEndpointState.next(queryEndpointState);
            queryEndpointState.next(choiceExistentConditionState);
            choiceExistentConditionState.afterwards().next(finishState);
        }

        const stateMachine = new sfn.StateMachine(this, `StateMachine-${props.statemachineName}`, {
            stateMachineName: `${this.projectPrefix}-${props.statemachineName}`,
            definition: startState,
            role: props.statemachineRole
        });

        return stateMachine;
    }

    private createSageMakerTrainingRole(baseName: string): iam.Role {
        const role = new iam.Role(this, `${baseName}SageMakerTrainingRole`, {
            roleName: `${this.projectPrefix}-${baseName}SageMakerTrainingRole`,
            assumedBy: new iam.ServicePrincipal('sagemaker.amazonaws.com'),
        });

        role.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "s3:ListBucket",
                "s3:*Object"
            ],
            resources: [
                '*'
            ]
        }));

        return role;
    }

    private createStateMachineRole(baseName: string): iam.Role {
        const role = new iam.Role(this, `${baseName}StateMachineRole`, {
            roleName: `${this.projectPrefix}-${baseName}StateMachineRole`,
            assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
        });

        role.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "glue:StartJobRun",
                "glue:GetJobRun",
                "glue:BatchStopJobRun",
                "glue:GetJobRuns"
            ],
            resources: [
                '*'
            ]
        }));
        role.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "lambda:InvokeFunction"
            ],
            resources: [
                '*'
            ]
        }));
        role.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "events:DescribeRule",
                "events:PutRule",
                "events:PutTargets"
            ],
            resources: [
                '*'
            ]
        }));
        role.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "sagemaker:CreateModel",
                "sagemaker:DeleteEndpointConfig",
                "sagemaker:DescribeTrainingJob",
                "sagemaker:CreateEndpoint",
                "sagemaker:StopTrainingJob",
                "sagemaker:CreateTrainingJob",
                "sagemaker:UpdateEndpoint",
                "sagemaker:CreateEndpointConfig",
                "sagemaker:DeleteEndpoint",
                "sagemaker:AddTags"
            ],
            resources: [
                '*'
            ]
        }));

        return role;
    }

    private createGlueEtl(baseName: string, bucket: s3.Bucket, filePath: string, timeoutInMin: number): glue.CfnJob {
        const tempArray = filePath.split('/');
        const fileName = tempArray[tempArray.length - 1];
        const directory = filePath.replace(`/${fileName}`, '');

        return new GlueJobConstruct(this, baseName, {
            baseName: baseName,
            projectPrefix: this.projectPrefix,
            bucket: bucket,
            timeoutInMin: timeoutInMin,
            etlScriptFileName: fileName,
            etlScriptFilePath: directory,
            etlScriptFileS3Key: this.bucketKeyforGlueCode
        }).job;
    }

    private createQueryEndpointLambda(baseName: string): lambda.Function {
        const func = new lambda.Function(this, `${baseName}-query-endpoint`, {
            functionName: `${this.projectPrefix}-${baseName}QueryEndpointFunc`,
            runtime: lambda.Runtime.PYTHON_3_7,
            code: lambda.Code.fromAsset('codes/lambda/mlops-query-endpoint/src'),
            handler: 'handler.handle',
            timeout: cdk.Duration.minutes(1)
        });

        func.role?.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'sagemaker:Describe*'
            ],
            resources: ['*']
        }));

        return func;
    }

    private createQueryAccuracyLambda(baseName: string): lambda.Function {
        const func = new lambda.Function(this, `${baseName}-query-accuracy`, {
            functionName: `${this.projectPrefix}-${baseName}QueryAccuracyFunc`,
            runtime: lambda.Runtime.PYTHON_3_7,
            code: lambda.Code.fromAsset('codes/lambda/mlops-query-accuracy/src'),
            handler: 'handler.handle',
            timeout: cdk.Duration.minutes(1)
        });

        func.role?.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'sagemaker:Describe*'
            ],
            resources: ['*']
        }));

        return func;
    }

    private createTriggerStateMachineLambda(baseName: string, bucket: s3.Bucket, stateMachine: sfn.StateMachine) {
        const func = new lambda.Function(this, `${baseName}-trigger-statemachine`, {
            functionName: `${this.projectPrefix}-${baseName}TriggerSateMachine`,
            runtime: lambda.Runtime.PYTHON_3_7,
            code: lambda.Code.fromAsset('codes/lambda/mlops-trigger-statemachine/src'),
            handler: 'handler.handle',
            environment: {
                EndpointName: `${this.projectPrefix}-${baseName}`,
                StateMachineArn: stateMachine.stateMachineArn,
                BucketKeyForInput: this.bucketKeyForInput,
                BucketKeyForOutput: this.bucketKeyForOutput
            },
            timeout: cdk.Duration.minutes(1)
        });

        bucket.grantRead(func);
        stateMachine.grantStartExecution(func);

        func.addEventSource(new lambda_event.S3EventSource(bucket, {
            events: [s3.EventType.OBJECT_CREATED_PUT],
            filters: [{ prefix: this.bucketKeyForInput }]
        }));

        return func;
    }
}
