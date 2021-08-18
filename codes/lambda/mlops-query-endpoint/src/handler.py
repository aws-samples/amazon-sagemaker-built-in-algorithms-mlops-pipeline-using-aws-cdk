import json

import boto3
from botocore.exceptions import ClientError


def handle(event, context):
    print('handle---', event)

    if 'ServeSageMaker' in event and 'EndpointName' in event['ServeSageMaker']:
        client = boto3.client('sagemaker')
        endpoint_name = event['ServeSageMaker']['EndpointName']

        try:
            response = client.describe_endpoint(
                            EndpointName=endpoint_name
                        )
            print('response', response)
            return {'Existent': 'TRUE'}
        except ClientError as e:
            print('{} is not existent in endpoint list'.format(endpoint_name))
            return {'Existent': 'FALSE'}
    else:
        error_msg = 'key error: check key in event - {}'.format(json.dumps(event))
        print(error_msg)
        raise KeyError(error_msg)
 