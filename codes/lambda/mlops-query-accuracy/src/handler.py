import json

import boto3
from botocore.exceptions import ClientError


def handle(event, context):
    print('handle---', event)

    if 'TrainSageMaker' in event and 'TrainingJobName' in event['TrainSageMaker']:
        client = boto3.client('sagemaker')
        training_job_name = event['TrainSageMaker']['TrainingJobName']

        try:
            response = client.describe_training_job(
                            TrainingJobName=training_job_name
                        )
            print('response', response)
            for metric in response["FinalMetricDataList"]:
                metric["Timestamp"] = metric["Timestamp"].timestamp()

            print('Metric  ==> {}'.format(json.dumps(response["FinalMetricDataList"])))
            return {'Metrics': response["FinalMetricDataList"]}
        except ClientError as e:
            error_msg = '{} is not existent in training list'.format(training_job_name)
            print(error_msg)
            raise KeyError(error_msg)
    else:
        error_msg = 'key error: check key in event - {}'.format(json.dumps(event))
        print(error_msg)
        raise KeyError(error_msg)
 