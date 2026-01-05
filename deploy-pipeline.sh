#!/bin/bash
# Deploy AWS CodePipeline for eventsquid-api-private
# Replace the placeholder values below with your actual values

aws cloudformation create-stack \
  --stack-name eventsquid-api-pipeline \
  --template-body file://cloudformation/pipeline.yaml \
  --parameters \
    ParameterKey=GitHubOwner,ParameterValue=ES \
    ParameterKey=GitHubRepo,ParameterValue=eventsquid-api-private \
    ParameterKey=GitHubBranch,ParameterValue=main \
    ParameterKey=GitHubConnectionArn,ParameterValue=arn:aws:codestar-connections:us-west-2:326684255434:connection/0b67c1a2-20c4-40f6-998e-2acb9bce9059 \
    ParameterKey=VpcId,ParameterValue=vpc-REPLACE_WITH_YOUR_VPC_ID \
    ParameterKey=SubnetIds,ParameterValue=subnet-REPLACE_WITH_SUBNET1,subnet-REPLACE_WITH_SUBNET2 \
    ParameterKey=MongoSecretName,ParameterValue=mongodb/eventsquid \
    ParameterKey=MongoDbName,ParameterValue=eventsquid \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-west-2 \
  --profile eventsquid

echo ""
echo "Pipeline stack deployment initiated!"
echo "Monitor progress with:"
echo "  aws cloudformation describe-stacks --stack-name eventsquid-api-pipeline --region us-west-2 --profile eventsquid"
echo ""
echo "Or check the AWS Console:"
echo "  https://console.aws.amazon.com/cloudformation/home?region=us-west-2#/stacks"

