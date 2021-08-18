import sys

from awsglue.context import GlueContext
from awsglue.dynamicframe import DynamicFrame
from awsglue.job import Job
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext

# Retrieve parameters for the Glue job.
args = getResolvedOptions(sys.argv, ["JOB_NAME", "S3_INPUT_FILE", "S3_TRAIN_KEY", "S3_VALIDATE_KEY"])

sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)
job.init(args["JOB_NAME"], args)

# Create a PySpark dataframe from the source table.
source_data_frame = spark.read.load(args["S3_INPUT_FILE"], format="csv", inferSchema=True, header=False)

# Split the dataframe in to training and validation dataframes.
train_data, val_data = source_data_frame.randomSplit([0.7, 0.3])

# Write both dataframes to the destination datastore.
train_path = args["S3_TRAIN_KEY"]
val_path = args["S3_VALIDATE_KEY"]

train_data.write.save(train_path, format="csv", mode="overwrite")
val_data.write.save(val_path, format="csv", mode="overwrite")

# Complete the job.
job.commit()