# Webforx Online Storeshop – Infrastructure (Terraform)

This folder contains Terraform code to deploy the app to AWS:

- RDS PostgreSQL (`webforx_store`)
- Secrets Manager DB credentials
- ECS Fargate cluster + service
- ALB + target group + listener
- Security groups, IAM roles, CloudWatch log group

## Usage

1. Install Terraform and configure `aws` CLI for the target account.
2. Set your subnet IDs and image URI in `terraform.tfvars`:

   ```hcl
   public_subnet_ids  = ["subnet-aaaa1111", "subnet-bbbb2222"]
   private_subnet_ids = ["subnet-cccc3333", "subnet-dddd4444"]
   container_image    = "123456789012.dkr.ecr.us-east-1.amazonaws.com/wfx-storeshop:latest"

