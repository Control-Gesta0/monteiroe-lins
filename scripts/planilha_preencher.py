import sys, json, openpyxl, shutil
src, cen, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
for nome, rows in json.load(open(cen)).items():
    wb = openpyxl.load_workbook(src)
    ws = wb['CONTRACHEQUE']
    ws['B3'] = 'TESTE ' + nome
    for i, r in enumerate(rows):
        ws.cell(row=8+i, column=2, value=r[0]); ws.cell(row=8+i, column=3, value=r[1]); ws.cell(row=8+i, column=4, value=r[2])
        if len(r) > 3: ws.cell(row=8+i, column=6, value=r[3])
    wb.save(f"{outdir}/{nome}.xlsx")
