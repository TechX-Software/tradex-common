import FieldRequiredError from "./FieldRequiredError";
import GeneralError from "./GeneralError";
import UriNotFound from "./UriNotFound";
import SystemError from "./SystemError";
import ObjectNotFoundError from "./ObjectNotFoundError";
import InvalidParameterError from "./InvalidParameterError";
import InvalidIdSecretError from "./InvalidIdSecretError";
import InvalidFieldValueError from "./InvalidFieldValueError";
import { ForwardError } from "./ForwardError";
import TokenExpiredError from "./TokenExpiredError";

export const EMAIL_VALIDATION_FAILED = 'EMAIL_VALIDATION_ERROR';
export const TEMPLATE_LOAD_FAILED = 'TEMPLATE_LOAD_FAILED';
export {
  FieldRequiredError,
  GeneralError,
  UriNotFound,
  SystemError,
  ObjectNotFoundError,
  InvalidParameterError,
  InvalidIdSecretError,
  InvalidFieldValueError,
  ForwardError,
  TokenExpiredError,
}