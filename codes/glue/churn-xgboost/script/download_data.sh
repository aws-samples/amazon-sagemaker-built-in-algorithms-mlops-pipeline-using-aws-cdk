#!/bin/sh

DATA_PATH=codes/glue/churn-xgboost/data
DATA_FILE=input.csv

mkdir $DATA_PATH

curl -o $DATA_PATH/$DATA_FILE https://raw.githubusercontent.com/aws/amazon-sagemaker-examples/master/step-functions-data-science-sdk/automate_model_retraining_workflow/data/customer-churn.csv