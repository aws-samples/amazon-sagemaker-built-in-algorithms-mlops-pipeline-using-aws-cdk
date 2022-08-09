import os
import csv
import boto3


os.environ['AWS_PROFILE'] = 'cdk-v2'
_endpoint_name = 'MLOpsDemo-churn-xgboost'

_input_file = 'codes/glue/churn-xgboost/data/input.csv'
_sagemaker = boto3.client('sagemaker-runtime')

def test_invoke(endpoint_name: str, input_file: str, loop_count: int):
    with open(input_file) as reader:
        for index, line in enumerate(reader):
            if index == loop_count:
                break
            
            print(f'{index} Invocation ------------------')
            line_arr = line.rstrip('\n').split(',')
            input = ','.join(line_arr[1:])
            label = line_arr[0]
            print('>>input: ', input)
            print('>>label: ', label)

            response = _sagemaker.invoke_endpoint(
                        EndpointName=endpoint_name,
                        Body=input,
                        ContentType='text/csv',
                        Accept='Accept'
                    )
            print('>>prediction: ', response['Body'].read().decode())


if __name__ == '__main__':
    test_invoke(_endpoint_name, _input_file, 5)
