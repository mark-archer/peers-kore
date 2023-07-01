import { Collection, FieldType, IDataSource, IEntity } from "./collection"

import {
  Boolean as RBoolean,
  Number as RNumber,
  String as RString,
  Record as RObject,
  InstanceOf as RInstanceOf,
  Unknown as RAny,
  Runtype
} from 'runtypes';

const RDate = RInstanceOf(Date);

// these are intended to be overridden by individual applications when generating types
export const config = {
  RId: RString as Runtype,
  dataSourceFactory: function<T = any>(entity: IEntity): IDataSource<T> {
    throw new Error("peers-kore orm `factory.config.dataSourceFactory` function needs to be set before types can be generated and imported");
  },
  entities: {} as Record<string, IEntity>
}

const fileHeader = `
// Warning: this file is generated by "peers-kore/orm/factory.ts"

import { factory } from 'peers-kore';`;

function colTypeToTypescriptType(colType: FieldType) {
  switch (colType) {
    case 'id': return 'string';
    default:
      return colType
  }
}

async function genIType(entity: IEntity) {
  let code = "";
  if (entity.extends) {
    code += `import { I${entity.extends.name} } from './${entity.extends.name}';\n\n`
  } else {
    code += `\n`
  }
  code += `export interface I${entity.name} ${entity.extends ? `extends I${entity.extends.name}` : ''} {`;
  for (const col of entity.fields) {
    code += `\n  ${col.name}${col.optional ? '?' : ''}: ${colTypeToTypescriptType(col.dataType)}`
  }
  code += `\n}`
  return code;
}

export function pluralize(name: string) {
  if (name.endsWith('s')) {
    return name + 'es';
  }
  return name + 's';
}

export function singular(name: string) {
  if (name.endsWith('es')) {
    return name.substring(0, name.length-1);
  }
  if (name.endsWith('s')) {
    return name.substring(0, name.length);
  }
  return name
}

async function genCollection(entity: IEntity) {
  const namePlural = entity.namePlural || pluralize(entity.name);
  return `export const ${namePlural} = factory.collectionFactory<I${entity.name}>(factory.config.entities.${entity.name})\n`;
}

export async function generateTypedEntity(
  entity: IEntity,
  options?: {
    fs?: any,
    dontGenInterface?: boolean,
    dontWiteFile?: boolean,
    fileDir?: string,
    fileName?: string,
    fileHeader?: string,
    fileFooter?: string,
  }
) {
  let code = fileHeader;
  if (options?.fileHeader) {
    code += `\n` + options.fileHeader;
  }

  // code += `\n\n// ${entity.name}`
  if (!(options?.dontGenInterface)) {
    code += `\n` + await genIType(entity);
  }
  code += `\n` + await genCollection(entity);

  if (options?.fileFooter) {
    code += `\n` + options.fileFooter;
  }

  if ((options?.dontWiteFile)) {
    return code;
  }


  const fs = options?.fs ?? eval("require(`fs`)");
  let filePath = options?.fileDir ?? `./orm-types`;
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(filePath, { recursive: true });
  }
  filePath += '/' + (options?.fileName ?? `${entity.name}.ts`);
  fs.writeFileSync(filePath, code);
  return true;
}

function FieldTypeToRField(fieldType: FieldType) {
  switch (fieldType) {
    case 'id':
      return config.RId;
    case 'Date':
      return RDate;
    case 'string':
      return RString;
    case 'any':
      return RAny;
    case 'boolean':
      return RBoolean;
    case 'number':
      return RNumber;
    default:
      throw new Error('Unhandled or unrecognized FieldType: ' + fieldType);
  }
}

export function validationFactory(entity: IEntity) {
  const rFields = {};
  for (const field of entity.fields) {
    let rField: any = FieldTypeToRField(field.dataType);
    if (field.optional) {
      rField = rField.optional().nullable();
    }
    if (field.array) {
      console.warn(`array types in kore.orm.factory have not been fully implemented`);
    }
    rFields[field.name] = rField;
  }
  const rType = RObject(rFields);
  function validate(data) {
    const validationResult = rType.validate(data)
    if (!validationResult.success) {
      const details = (validationResult as any)?.details;
      throw new Error('Validation failed: ' + JSON.stringify(details, null, 2))
    }
  }
  return validate;
}

export function collectionFactory<T>(
  entity: IEntity, 
  dataSource: IDataSource<T> = config.dataSourceFactory<T>(entity),
  validate: ((data: any) => void) = validationFactory(entity)
): Collection<T> {
  return new Collection<T>(entity, validate, dataSource);
}