output "bucket_name" {
  value = aws_s3_bucket.creatives.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.creatives.arn
}

output "cdn_domain_name" {
  value = aws_cloudfront_distribution.cdn.domain_name
}
