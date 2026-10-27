import type { PlannerApprovalRequest } from './planning.ts'
import { validateJsonSchema } from './aiSchema.ts'
export function validateApprovalRequest(value: unknown, allowEmpty=false): PlannerApprovalRequest {
  const text={type:'string',minLength:1,maxLength:500}
  validateJsonSchema(value,{type:'object',required:['token','blocks'],additionalProperties:false,properties:{
    token:{type:'string',minLength:1,maxLength:1000000},blocks:{type:'array',minItems:allowEmpty?0:1,maxItems:200,items:{type:'object',additionalProperties:false,
      required:['id','title','date','startTime','endTime','durationMinutes','priority','included','confirmed'],properties:{id:text,title:text,date:text,startTime:text,endTime:text,durationMinutes:{type:'integer',minimum:1,maximum:1440},priority:{type:'string',enum:['low','medium','high']},included:{type:'boolean'},confirmed:{type:'boolean'}}}}
  }})
  return structuredClone(value as PlannerApprovalRequest)
}
