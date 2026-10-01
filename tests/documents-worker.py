"""Run inside the real documents image: automatic and explicit page breaks."""
import io,zipfile,sys,tempfile,subprocess,hashlib
from pathlib import Path
sys.path.insert(0,'/app')
from server import convert,validate_docx

def document():
    b=io.BytesIO()
    paragraph=lambda s:'<w:p><w:r><w:t>'+s+'</w:t></w:r></w:p>'
    body=paragraph('DOCUMENT START')+''.join(paragraph('Paragraph %03d '%i+'Original page layout and automatic flow. '*6) for i in range(90))
    body+='<w:p><w:r><w:br w:type="page"/></w:r></w:p>'+paragraph('EXPLICIT FINAL PAGE')
    body+='<w:tbl><w:tblPr><w:tblW w:w="8000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc>'+paragraph('Left cell')+'</w:tc><w:tc>'+paragraph('Right cell')+'</w:tc></w:tr></w:tbl>'
    body+='<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>'
    with zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'</w:body></w:document>')
    return b.getvalue()

data=document();before=hashlib.sha256(data).hexdigest()
pdf=convert(data);assert hashlib.sha256(data).hexdigest()==before
with tempfile.TemporaryDirectory(prefix='docx-qa-') as d:
    p=Path(d)/'sample.pdf';p.write_bytes(pdf)
    info=subprocess.check_output(['pdfinfo',str(p)],text=True)
    pages=int(next(l.split(':')[1] for l in info.splitlines() if l.startswith('Pages:')))
    assert pages>=4,info
    text=subprocess.check_output(['pdftotext','-layout',str(p),'-'],text=True).split('\f')
    assert 'DOCUMENT START' in text[0] and 'EXPLICIT FINAL PAGE' in text[-2]
    assert 'Left cell' in text[-2] and 'Right cell' in text[-2]
    assert 'Paragraph 089' in ''.join(text)
    if len(sys.argv)>1:
        target=Path(sys.argv[1]);target.mkdir(exist_ok=True)
        (target/'sample.docx').write_bytes(data);(target/'sample.pdf').write_bytes(pdf)
        subprocess.run(['pdftoppm','-f',str(pages),'-singlefile','-scale-to','1000','-png',str(p),str(target/'last-page')],check=True)
try:validate_docx(b'invalid')
except (ValueError,zipfile.BadZipFile):pass
else:raise AssertionError('invalid document accepted')
try:convert(data,lambda:True)
except (TimeoutError,ValueError):pass
else:raise AssertionError('cancelled conversion returned pages')
assert not list(Path('/tmp').glob('document-*')),'temporary contents left behind'
print({'realConversion':True,'pages':pages,'originalUnchanged':True,'cancelledAndCleaned':True})
