# 未转换为采购订单的采购申请查询

本脚本中包含多个相似查询，用于找出那些尚未转换为采购订单的采购申请行。这些查询是[[采购管理]]中清理历史数据或监控未清申请的常见方法。

## 查询逻辑

### 基本查询（未分组）
```sql
SELECT DISTINCT 
  EBAN.BANFN AS BANFN,
  EBAN.BNFPO AS BNFPO,
  EBAN.LOEKZ AS LOEKZ,
  EBAN.MATNR AS MATNR,
  MAKT.MAKTX AS MAKTX,
  EBAN.MENGE AS QUANTITY,
  EBAN.MEINS AS UNIT,
  EBAN.BADAT AS REQ_DATE,
  T161T.BATXT AS REQ_TYPE_DESC
FROM EBAN
LEFT JOIN MAKT ON ...
LEFT JOIN T161T ON ...
WHERE NOT EXISTS (
  SELECT 1 
  FROM EKPO 
  WHERE EKPO.BANFN = EBAN.BANFN 
    AND EKPO.BNFPO = EBAN.BNFPO
    AND EKPO.MANDT = EBAN.MANDT 
)
AND EBAN.BADAT <= '20241231' 
AND T161T.BATXT = '采购申请' 
AND EBAN.LOEKZ = ' ' 
AND EBAN.MATNR != ' '
ORDER BY EBAN.BADAT DESC
```

- **条件说明**:
  - `NOT EXISTS (SELECT 1 FROM EKPO ...)`：只选择在EKPO中无对应采购订单行项目的采购申请行。
  - `EBAN.BADAT <= '20241231'`：申请日期在2024年12月31日及之前。
  - `T161T.BATXT = '采购申请'`：只选择申请类型为“采购申请”的记录（排除其他类型如框架协议等）。
  - `EBAN.LOEKZ = ' '`：采购申请未被删除（删除标记为空）。
  - `EBAN.MATNR != ' '`：物料号不为空。
- **输出**: 返回采购申请号、行号、物料、描述、数量、单位、申请日期、类型描述。

### 分组汇总查询
```sql
SELECT 
  EBAN.BANFN AS BANFN,
  MAX(EBAN.BNFPO) AS BNFPO,
  MAX(EBAN.LOEKZ) AS LOEKZ,
  MAX(EBAN.MATNR) AS MATNR,
  MAX(MAKT.MAKTX) AS MAKTX,
  SUM(EBAN.MENGE) AS QUANTITY,
  MAX(EBAN.MEINS) AS UNIT,
  MAX(EBAN.BADAT) AS REQ_DATE,
  MAX(T161T.BATXT) AS REQ_TYPE_DESC
FROM EBAN
... （相同连接和条件）
GROUP BY EBAN.BANFN
ORDER BY MAX(EBAN.BADAT) DESC
UP TO 300 ROWS
INTO TABLE @DATA(lt_grouped_req).
```
- **差异**: 按采购申请号（`BANFN`）分组，对数量求和（`SUM(MENGE)`），其他字段取最大值（通常同组内一致）。
- **用途**: 如果单个采购申请有多行，汇总后得到该申请的总数量。
- **附加语法**: `UP TO 300 ROWS INTO TABLE @DATA(lt_grouped_req)` 是ABAP内表语法，表明此查询可能在ABAP程序中使用，将结果存入内表`lt_grouped_req`。

### 仅获取采购申请号
```sql
SELECT TTT.BANFN FROM (
  SELECT DISTINCT EBAN.BANFN AS BANFN
  FROM EBAN ... （相同条件）
) TTT GROUP BY TTT.BANFN
```
这是简化的版本，只返回符合条件的采购申请号列表（去重后）。

## 常见用途

- **清理历史数据**：将长期未转换的采购申请进行删除或归档。在脚本末尾的`update EBAN set LOEKZ='X' where BANFN='1100442840'`即为删除示例。
- **监控与报告**：定期检查哪些采购申请尚未处理。
- **数据迁移**：在系统切换前清理无效申请。

## 注意事项

- 查询条件中的日期`'20241231'`是硬编码，应根据实际需求调整。
- `T161T.BATXT = '采购申请'`依赖于语言环境（`SPRAS='1'`），通常表示中文。
- 如果采购申请已部分转换为采购订单（即某些行已转换，某些未转换），`NOT EXISTS`会返回未转换的行，而`EXISTS`用于关联整张表。

## 参见
- [[SAP采购申请相关数据库表结构]]
- [[采购申请删除标记清理SQL脚本]]
- [[采购管理]]