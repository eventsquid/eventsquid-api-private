# S3 Access from Lambda in a VPC

When the API Lambda runs inside a VPC (as configured in `cloudformation/template.yaml`), it **does not have internet access** by default. Calls to AWS services that use public endpoints (such as S3) can fail with **connection timeouts** (e.g. `ETIMEDOUT`, `TimeoutError`).

## Symptoms

- **Error:** `Failed to upload file to S3: ...` with `ETIMEDOUT` or `AggregateError` in logs.
- **Where:** Any route that uploads or downloads from S3 (e.g. affiliate document add, sponsor logos, event logos).

## Cause

Lambda is attached to subnets (private or public). Traffic to S3’s public endpoint (`s3.<region>.amazonaws.com`) goes over the internet. Without a path to the internet or to S3 via AWS network, the connection never completes and times out.

## Solutions

Choose one of the following so the Lambda can reach S3.

### Option 1: S3 VPC Gateway Endpoint (recommended, no extra cost)

Add an **S3 Gateway Endpoint** in the same VPC and attach it to the **route tables** used by the Lambda’s subnets. Traffic to S3 then stays on the AWS network and does not need the internet or a NAT Gateway.

1. In the AWS Console: **VPC** → **Endpoints** → **Create endpoint**.
2. **Service category:** AWS services.
3. **Service name:** `com.amazonaws.<region>.s3` (e.g. `com.amazonaws.us-west-2.s3`).
4. **VPC:** The same VPC as the Lambda.
5. **Route tables:** Select the route tables for the subnets where the Lambda runs.
6. **Policy:** Full access (or restrict to the buckets you use).

After the endpoint is created, no code or Lambda config changes are needed; the SDK will use the same S3 endpoint and traffic will be routed via the gateway endpoint.

### Option 2: NAT Gateway

Place the Lambda in **private subnets** whose route tables send default (`0.0.0.0/0`) traffic to a **NAT Gateway** in a public subnet. The Lambda can then reach the internet (and thus S3’s public endpoint).

- Requires a NAT Gateway (and possibly multiple for HA), which has an hourly cost and data processing charges.
- Use this if the Lambda also needs to reach other internet endpoints (e.g. third‑party APIs). If the only need is S3, the gateway endpoint (Option 1) is simpler and cheaper.

## IAM

The Lambda execution role must have S3 permissions. The CloudFormation template includes an **S3Access** policy for the `eventsquid` and `eventsquid-private` buckets. If you use different bucket names, add those buckets to the template or the role’s S3 policy.

## Error messages

If a timeout occurs, the API and logs now include a short hint that VPC networking may be the cause and that you should ensure subnets have a NAT Gateway or an S3 VPC Gateway Endpoint.
