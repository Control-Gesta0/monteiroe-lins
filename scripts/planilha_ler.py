import sys, json, glob, os, openpyxl
res = {}
for f in sorted(glob.glob(sys.argv[1] + '/*.xlsx')):
    wb = openpyxl.load_workbook(f, data_only=True)
    c = wb['COMPARATIVO']; ch = wb['CONTRACHEQUE']
    v = lambda a: c[a].value
    res[os.path.basename(f)[:-5]] = dict(rendaBruta=v('B6'), descontosObrigatorios=v('B7'), rendaLiquida=v('B8'), emprestimoConsignado=v('B12'), cartaoConsignado=v('B13'), cartaoBeneficio=v('B14'), totalConsignacoes=v('B15'), comprometimento=v('B20'), reducaoTeseA=v('C21'), reducaoTeseB=v('D21'),
        classes=[ch.cell(row=r, column=7).value for r in range(8, 20) if ch.cell(row=r, column=4).value is not None], conclusao=v('A27'))
print(json.dumps(res, ensure_ascii=False, indent=1))
