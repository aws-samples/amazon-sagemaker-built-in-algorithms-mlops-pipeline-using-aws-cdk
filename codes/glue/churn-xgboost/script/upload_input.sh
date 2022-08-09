#!/bin/sh

DATA_PATH=codes/glue/churn-xgboost/data
DATA_FILE=input.csv
ENDPOINT_NAME=churn-xgboost

APP_CONFIG=$1
S3_UPLOAD_KEY=$2

ACCOUNT=$(cat $APP_CONFIG | jq -r '.Project.Account')
REGION=$(cat $APP_CONFIG | jq -r '.Project.Region')
PROFILE_NAME=$(cat $APP_CONFIG | jq -r '.Project.Profile')
PROJECT_NAME=$(cat $APP_CONFIG | jq -r '.Project.Name')
PROJECT_STAGE=$(cat $APP_CONFIG | jq -r '.Project.Stage')
PROJECT_PREFIX=$PROJECT_NAME$PROJECT_STAGE
STACK_NAME=ChurnXgboostPipelineStack
BUCKET_SUFFIX=asset

PROJECT_PREFIX_LOWER=$(echo $PROJECT_PREFIX | tr '[:upper:]' '[:lower:]')
STACK_NAME_LOWER=$(echo $STACK_NAME | tr '[:upper:]' '[:lower:]')

if [ -z "$PROFILE_NAME" ]; then
    aws s3 cp $DATA_PATH/$DATA_FILE s3://"$PROJECT_PREFIX_LOWER"-"$STACK_NAME_LOWER"-"$BUCKET_SUFFIX"-"$REGION"-"${ACCOUNT:0:5}"/input/"${S3_UPLOAD_KEY}"
else
    aws s3 cp $DATA_PATH/$DATA_FILE s3://"$PROJECT_PREFIX_LOWER"-"$STACK_NAME_LOWER"-"$BUCKET_SUFFIX"-"$REGION"-"${ACCOUNT:0:5}"/input/"${S3_UPLOAD_KEY}" --profile $PROFILE_NAME
fi