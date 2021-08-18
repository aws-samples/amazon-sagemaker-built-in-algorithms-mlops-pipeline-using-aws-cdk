import os
import sys
import json
import time

import boto3
from botocore.exceptions import ClientError


_endpoint_name = os.environ.get('EndpointName', 'no-endpoint-name')
_statemachine_arn = os.environ.get('StateMachineArn', 'no-statemachine-arn')
_bucket_key_for_input = os.environ.get('BucketKeyForInput', 'no-bucket-key-for-input')
_bucket_key_for_output = os.environ.get('BucketKeyForOutput', 'no-bucket-key-for-output')


def trigger_statemachine(client, execution_name, statemachine_arn, request):
    print('trigger_statemachine: request==>', request)

    if len(execution_name) > 80:
        execution_name = execution_name[:80]

    try:
        client.start_execution(stateMachineArn=statemachine_arn,
                            name=execution_name, input=json.dumps(request))
    except ClientError as e:
        print('Error : trigger_statemachine - {}'.format(e.response['Error']['Message']))


def get_request_template():
    return {
        "PreprocessGlue": {
                "--S3_INPUT_FILE": "s3://bucket-name/input/xxx/input.csv",
                "--S3_TRAIN_KEY": "s3://bucket-name/output/xxx/train/",
                "--S3_VALIDATE_KEY": "s3://bucket-name/output/xxx/validate/"
            },
        "TrainSageMaker": {
                "TrainingJobName": "projectprefix-xxx-input",
                "TrainData": "s3://bucket-name/output/xxx/train/",
                "ValidateData": "s3://bucket-name/output/xxx/validate/",
                "TrainOutput": "s3://bucket-name/output/xxx/model/projectprefix-xxx-input/"
            },
        "ServeSageMaker": {
                "ModelName": "projectprefix-xxx-input",
                "EndpointConfigName": "projectprefix-xxx-input",
                "EndpointName": "churn-xgboost"
            }  
    }


def handle(event, context):
    print('event--->', event)

    client = boto3.client('stepfunctions')

    for record in event['Records']:
        bucket_name: str = record['s3']['bucket']['name']
        input_file_key: str = record['s3']['object']['key']
        print('etl_input_file_key => {}'.format(input_file_key))
        
        if input_file_key.find('.') > -1:
            temp = input_file_key.replace(f'{_bucket_key_for_input}/', f'{_bucket_key_for_output}/', 1)
            output_dir_key = temp.split('.')[0]

            temp = output_dir_key.replace(f'{_bucket_key_for_output}/', '', 1)
            temp = temp.replace("/", "-")
            execution_name = f'{_endpoint_name}-{temp}'

            request = get_request_template()
            request['PreprocessGlue']['--S3_INPUT_FILE'] = f's3://{bucket_name}/{input_file_key}'
            request['PreprocessGlue']['--S3_TRAIN_KEY'] = f's3://{bucket_name}/{output_dir_key}/data/train/'
            request['PreprocessGlue']['--S3_VALIDATE_KEY'] = f's3://{bucket_name}/{output_dir_key}/data/validate/'
            
            request['TrainSageMaker']['TrainingJobName'] = execution_name
            request['TrainSageMaker']['TrainData'] = request['PreprocessGlue']['--S3_TRAIN_KEY']
            request['TrainSageMaker']['ValidateData'] = request['PreprocessGlue']['--S3_VALIDATE_KEY']
            request['TrainSageMaker']['TrainOutput'] = f's3://{bucket_name}/{output_dir_key}/model/'
            
            request['ServeSageMaker']['ModelName'] = execution_name
            request['ServeSageMaker']['EndpointConfigName'] = execution_name
            request['ServeSageMaker']['EndpointName'] = _endpoint_name

            trigger_statemachine(client, execution_name, _statemachine_arn, request)
