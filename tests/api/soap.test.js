import { describe, it, expect } from 'vitest'
import { xe, parseFault, buildEnvelope, buildBody, parseResponse } from '../../api/soap.js'

// Quita saltos e indentación para poder comparar XML generado sin depender del formato.
const flat = s => s.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()

describe('xe (escape XML)', () => {
  it('escapa los cinco caracteres especiales', () => {
    expect(xe('a & b')).toBe('a &amp; b')
    expect(xe('<tag>')).toBe('&lt;tag&gt;')
    expect(xe('say "hi"')).toBe('say &quot;hi&quot;')
  })

  it('escapa el ampersand antes que el resto, sin doble escape', () => {
    expect(xe('<a & b>')).toBe('&lt;a &amp; b&gt;')
  })

  it('devuelve string vacío para null y undefined', () => {
    expect(xe(null)).toBe('')
    expect(xe(undefined)).toBe('')
  })

  it('coacciona valores no-string', () => {
    expect(xe(42)).toBe('42')
    expect(xe(false)).toBe('false')
  })
})

describe('buildEnvelope', () => {
  it('emite header vacío cuando no hay sessionId ni version', () => {
    expect(buildEnvelope('<web:pingRequest/>', null)).toContain('<soapenv:Header/>')
  })

  it('incluye el SessionId cuando se pasa', () => {
    const env = buildEnvelope('<web:pingRequest/>', 'SID-123')
    expect(env).toContain('<SessionId>SID-123</SessionId>')
    expect(env).not.toContain('<soapenv:Header/>')
  })

  it('incluye la version cuando se pasa', () => {
    const env = buildEnvelope('<web:pingRequest/>', 'SID-123', '2.0')
    expect(env).toContain('<web:Version>2.0</web:Version>')
  })

  it('escapa el sessionId', () => {
    expect(buildEnvelope('<x/>', 'a&b')).toContain('<SessionId>a&amp;b</SessionId>')
  })

  it('envuelve el body dentro de soapenv:Body', () => {
    expect(buildEnvelope('<web:pingRequest/>', null))
      .toContain('<soapenv:Body><web:pingRequest/></soapenv:Body>')
  })
})

describe('buildBody', () => {
  it('lanza en una operación desconocida', () => {
    expect(() => buildBody('noExiste')).toThrow('Unknown operation: noExiste')
  })

  it('ping y getProjects no llevan parámetros', () => {
    expect(buildBody('ping')).toBe('<web:pingRequest/>')
    expect(buildBody('getProjects')).toBe('<web:allProjectsRequest/>')
    expect(buildBody('getSystemConfigurations')).toBe('<web:allSystemConfigurationsRequest/>')
  })

  it('logout, getProjectTasks, getTaskInfo y cancelTask escapan sus parámetros', () => {
    expect(buildBody('logout', { sessionId: 'a&b' }))
      .toContain('<SessionID>a&amp;b</SessionID>')
    expect(buildBody('getProjectTasks', { projectGuid: 'G-1' }))
      .toContain('<projectGuid>G-1</projectGuid>')
    expect(buildBody('getTaskInfo', { taskGuid: 'T-1' }))
      .toContain('<taskGuid>T-1</taskGuid>')
    expect(buildBody('cancelTask', { runId: '99' }))
      .toContain('<runId>99</runId>')
  })

  it('searchTasks usa filtro vacío cuando no se pasa nameFilter', () => {
    expect(buildBody('searchTasks', {})).toContain('<nameFilter></nameFilter>')
  })

  it('getAgents serializa activeOnly como booleano literal', () => {
    expect(buildBody('getAgents', { activeOnly: true })).toContain('<activeOnly>true</activeOnly>')
    expect(buildBody('getAgents', {})).toContain('<activeOnly>false</activeOnly>')
  })

  describe('runTask', () => {
    it('omite los elementos opcionales que no se pasan', () => {
      const body = buildBody('runTask', { taskName: 'T1' })
      expect(body).toContain('<taskName>T1</taskName>')
      expect(body).toContain('<description></description>')
      expect(body).not.toContain('<agentName>')
      expect(body).not.toContain('<agentGroup>')
      expect(body).not.toContain('<profileName>')
      expect(body).not.toContain('<globalVariables>')
    })

    it('incluye agentName, agentGroup y profileName cuando se pasan', () => {
      const body = buildBody('runTask', {
        taskName: 'T1', agentName: 'AG', agentGroup: 'GRP', profileName: 'PRF',
      })
      expect(body).toContain('<agentName>AG</agentName>')
      expect(body).toContain('<agentGroup>GRP</agentGroup>')
      expect(body).toContain('<profileName>PRF</profileName>')
    })

    it('serializa las variables globales como atributo name', () => {
      const body = buildBody('runTask', {
        taskName: 'T1',
        globalVariables: [{ name: 'V1', value: '10' }, { name: 'V2', value: 'x&y' }],
      })
      expect(body).toContain('<variable name="V1">10</variable>')
      expect(body).toContain('<variable name="V2">x&amp;y</variable>')
    })
  })

  it('getTaskStatusByRunId y su alias v2 comparten cuerpo', () => {
    expect(buildBody('getTaskStatusByRunId', { runId: '5' }))
      .toBe(buildBody('getTaskStatusByRunId2', { runId: '5' }))
  })

  describe('getAllExecutedTasks', () => {
    it('omite los rangos de fecha cuando no hay "from"', () => {
      const body = buildBody('getAllExecutedTasks2', { taskName: 'T1' })
      expect(body).toContain('<taskName>T1</taskName>')
      expect(body).not.toContain('<startDate>')
      expect(body).not.toContain('<endDate>')
    })

    it('emite startDate sin "to" cuando solo hay "from"', () => {
      const body = buildBody('getAllExecutedTasks2', { startDateFrom: '20260101000000.0000000' })
      expect(body).toContain('<startDate><from>20260101000000.0000000</from></startDate>')
      expect(body).not.toContain('<to>')
    })

    it('emite el rango completo de startDate y endDate', () => {
      const body = buildBody('getAllExecutedTasks2', {
        startDateFrom: 'A', startDateTo: 'B', endDateFrom: 'C', endDateTo: 'D', statusCode: 'ERROR',
      })
      expect(body).toContain('<startDate><from>A</from><to>B</to></startDate>')
      expect(body).toContain('<endDate><from>C</from><to>D</to></endDate>')
      expect(body).toContain('<statusCode>ERROR</statusCode>')
    })
  })

  describe('getTaskLogs', () => {
    // El XSD de SAP exige este orden exacto; si se altera, SAP rechaza la request.
    it('respeta el orden base64Encode, traceLog, errorLog, runId, monitorLog', () => {
      const body = flat(buildBody('getTaskLogs', {
        runId: '7',
        traceLog:   { getLog: true, pageNum: 1 },
        errorLog:   { getLog: true, pageNum: 2 },
        monitorLog: { getLog: true, pageNum: 3 },
      }))
      const order = ['base64Encode', 'traceLog', 'errorLog', 'runId', 'monitorLog']
      const positions = order.map(tag => body.indexOf(`<${tag}>`))
      expect(positions.every(p => p !== -1)).toBe(true)
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
    })

    it('omite los bloques de log cuyo getLog es falso', () => {
      const body = buildBody('getTaskLogs', { runId: '7', traceLog: { getLog: true } })
      expect(body).toContain('<traceLog>')
      expect(body).not.toContain('<errorLog>')
      expect(body).not.toContain('<monitorLog>')
    })

    it('usa pageNum 1 por defecto', () => {
      expect(buildBody('getTaskLogs', { runId: '7', traceLog: { getLog: true } }))
        .toContain('<pageNum>1</pageNum>')
    })

    it('base64Encode es true salvo que se pase false explícito', () => {
      expect(buildBody('getTaskLogs', { runId: '7' })).toContain('<base64Encode>true</base64Encode>')
      expect(buildBody('getTaskLogs', { runId: '7', base64Encode: false }))
        .toContain('<base64Encode>false</base64Encode>')
    })
  })
})

describe('parseFault', () => {
  it('devuelve null cuando no hay fault', () => {
    expect(parseFault('<Envelope><Body><ok/></Body></Envelope>')).toBeNull()
  })

  it('extrae faultcode y faultstring', () => {
    const f = parseFault('<faultcode>soap:Server</faultcode><faultstring>Boom</faultstring>')
    expect(f).toEqual({ faultCode: 'soap:Server', faultString: 'Boom' })
  })

  it('acepta la variante camelCase de los tags', () => {
    expect(parseFault('<faultCode>C</faultCode><faultString>S</faultString>'))
      .toEqual({ faultCode: 'C', faultString: 'S' })
  })

  it('ignora el prefijo de namespace', () => {
    expect(parseFault('<ns2:faultstring>Boom</ns2:faultstring>').faultString).toBe('Boom')
  })

  it('concatena el detail al faultstring cuando existe', () => {
    const f = parseFault('<faultstring>Boom</faultstring><message>sesión inválida</message>')
    expect(f.faultString).toBe('Boom — sesión inválida')
  })

  it('detecta el fault aunque solo venga el faultcode', () => {
    expect(parseFault('<faultcode>soap:Client</faultcode>'))
      .toEqual({ faultCode: 'soap:Client', faultString: null })
  })
})

describe('parseResponse', () => {
  it('lanza cuando la respuesta trae un SOAP fault', () => {
    expect(() => parseResponse('ping', '<faultstring>Sesión expirada</faultstring>'))
      .toThrow('Sesión expirada')
  })

  it('devuelve el XML crudo en una operación sin parser', () => {
    expect(parseResponse('operacionRara', '<x/>')).toEqual({ raw: '<x/>' })
  })

  it('ping y logout aceptan ambas capitalizaciones', () => {
    expect(parseResponse('ping', '<Message>pong</Message>')).toEqual({ message: 'pong' })
    expect(parseResponse('ping', '<message>pong</message>')).toEqual({ message: 'pong' })
    expect(parseResponse('logout', '<LogoutMessage>bye</LogoutMessage>')).toEqual({ message: 'bye' })
  })

  it('getProjects mapea la lista de proyectos', () => {
    const xml = `
      <projects><name>P1</name><guid>G1</guid><description>D1</description></projects>
      <projects><name>P2</name><guid>G2</guid><description>D2</description></projects>`
    expect(parseResponse('getProjects', xml)).toEqual([
      { name: 'P1', guid: 'G1', description: 'D1' },
      { name: 'P2', guid: 'G2', description: 'D2' },
    ])
  })

  it('getProjects devuelve lista vacía cuando no hay elementos', () => {
    expect(parseResponse('getProjects', '<Envelope><Body/></Envelope>')).toEqual([])
  })

  it('resuelve tags con prefijo de namespace', () => {
    const xml = '<ns2:projects><ns2:name>P1</ns2:name><ns2:guid>G1</ns2:guid></ns2:projects>'
    expect(parseResponse('getProjects', xml)[0]).toMatchObject({ name: 'P1', guid: 'G1' })
  })

  it('getProjectTasks y searchTasks usan contenedores distintos', () => {
    const tasksXml = '<tasks><taskName>T1</taskName><taskGuid>G1</taskGuid><type>batch</type></tasks>'
    expect(parseResponse('getProjectTasks', tasksXml)[0])
      .toMatchObject({ taskName: 'T1', taskGuid: 'G1', type: 'batch' })

    const returnXml = '<return><taskName>T2</taskName><taskGuid>G2</taskGuid></return>'
    expect(parseResponse('searchTasks', returnXml)[0]).toMatchObject({ taskName: 'T2', taskGuid: 'G2' })
  })

  describe('getTaskInfo', () => {
    const head = '<taskName>T1</taskName><taskGuid>G1</taskGuid><type>batch</type>'

    it('lee variables desde elementos globalVariable sueltos', () => {
      const xml = `${head}
        <globalVariable><name>V1</name><dataType>varchar</dataType><defaultValue>x</defaultValue></globalVariable>
        <globalVariable><name>V2</name></globalVariable>`
      const r = parseResponse('getTaskInfo', xml)
      expect(r.taskName).toBe('T1')
      expect(r.globalVariables.map(v => v.name)).toEqual(['V1', 'V2'])
      expect(r.globalVariables[0]).toMatchObject({ dataType: 'varchar', defaultValue: 'x' })
    })

    it('desciende a globalVariable dentro de un único contenedor globalVariables', () => {
      const xml = `${head}<globalVariables>
        <globalVariable><name>V1</name></globalVariable>
        <globalVariable><name>V2</name></globalVariable>
      </globalVariables>`
      expect(parseResponse('getTaskInfo', xml).globalVariables.map(v => v.name)).toEqual(['V1', 'V2'])
    })

    it('cae a elementos variable dentro del contenedor cuando no hay globalVariable', () => {
      const xml = `${head}<globalVariables>
        <variable><name>V1</name></variable>
        <variable><name>V2</name></variable>
      </globalVariables>`
      expect(parseResponse('getTaskInfo', xml).globalVariables.map(v => v.name)).toEqual(['V1', 'V2'])
    })

    it('trata el contenedor como la variable misma cuando no tiene hijos reconocibles', () => {
      const xml = `${head}<globalVariables><name>V1</name><dataType>int</dataType></globalVariables>`
      const vars = parseResponse('getTaskInfo', xml).globalVariables
      expect(vars).toHaveLength(1)
      expect(vars[0]).toMatchObject({ name: 'V1', dataType: 'int' })
    })

    it('trata múltiples contenedores globalVariables como una variable cada uno', () => {
      const xml = `${head}
        <globalVariables><name>V1</name></globalVariables>
        <globalVariables><name>V2</name></globalVariables>`
      expect(parseResponse('getTaskInfo', xml).globalVariables.map(v => v.name)).toEqual(['V1', 'V2'])
    })

    it('descarta las variables sin nombre', () => {
      const xml = `${head}
        <globalVariable><name>V1</name></globalVariable>
        <globalVariable><dataType>int</dataType></globalVariable>`
      expect(parseResponse('getTaskInfo', xml).globalVariables).toHaveLength(1)
    })

    it('prefiere property sobre properties para los metadatos', () => {
      const xml = `${head}<property><name>P1</name><value>V</value><caption>C</caption></property>`
      expect(parseResponse('getTaskInfo', xml).properties)
        .toEqual([{ name: 'P1', value: 'V', caption: 'C' }])
    })

    it('cae a properties cuando no hay elementos property', () => {
      const xml = `${head}<properties><name>P1</name><value>V</value></properties>`
      expect(parseResponse('getTaskInfo', xml).properties[0]).toMatchObject({ name: 'P1', value: 'V' })
    })
  })

  it('getAgents anida los agentes dentro de cada grupo', () => {
    const xml = `<agentGroups>
      <name>G1</name><guid>GG1</guid>
      <agent><name>A1</name><agentStatus>RUNNING</agentStatus><version>1.2</version></agent>
      <agent><name>A2</name><agentStatus>STOPPED</agentStatus></agent>
    </agentGroups>`
    const [group] = parseResponse('getAgents', xml)
    expect(group).toMatchObject({ name: 'G1', guid: 'GG1' })
    expect(group.agents.map(a => a.name)).toEqual(['A1', 'A2'])
    expect(group.agents[0].agentStatus).toBe('RUNNING')
  })

  it('getSystemConfigurations anida las dsConfigurations', () => {
    const xml = `<sysConfigurations>
      <name>S1</name><guid>SG1</guid>
      <dsConfiguration><dataStoreName>DS_IBP</dataStoreName><dataStoreConfigurationName>CFG1</dataStoreConfigurationName></dsConfiguration>
    </sysConfigurations>`
    const [sys] = parseResponse('getSystemConfigurations', xml)
    expect(sys.name).toBe('S1')
    expect(sys.dsConfigurations).toEqual([{ dataStoreName: 'DS_IBP', dataStoreConfigurationName: 'CFG1' }])
  })

  it('runTask acepta las tres capitalizaciones de runId', () => {
    expect(parseResponse('runTask', '<RunID>1</RunID>')).toEqual({ runId: '1' })
    expect(parseResponse('runTask', '<runId>2</runId>')).toEqual({ runId: '2' })
    expect(parseResponse('runTask', '<RunId>3</RunId>')).toEqual({ runId: '3' })
  })

  describe('getTaskStatusByRunId2', () => {
    it('quita el prefijo TASK: del statusCode', () => {
      const r = parseResponse('getTaskStatusByRunId2', '<statusCode>TASK:SUCCESS</statusCode>')
      expect(r.statusCode).toBe('SUCCESS')
    })

    it('deja el statusCode intacto cuando no trae prefijo', () => {
      expect(parseResponse('getTaskStatusByRunId2', '<statusCode>ERROR</statusCode>').statusCode)
        .toBe('ERROR')
    })

    it('mapea los campos y los uploadBatchInfos anidados', () => {
      const xml = `
        <projectName>P1</projectName><jobId>J1</jobId>
        <statusCode>TASK:RUNNING</statusCode><statusMsg>en curso</statusMsg>
        <startTime>20260101000000</startTime><endTime>20260101010000</endTime>
        <executionTime>3600</executionTime>
        <uploadBatchInfos><id>B1</id><name>batch1</name><startTime>T1</startTime></uploadBatchInfos>
        <uploadBatchInfos><id>B2</id><name>batch2</name><startTime>T2</startTime></uploadBatchInfos>`
      const r = parseResponse('getTaskStatusByRunId2', xml)
      expect(r).toMatchObject({
        projectName: 'P1', jobId: 'J1', statusCode: 'RUNNING',
        statusMsg: 'en curso', executionTime: '3600',
      })
      expect(r.uploadBatchInfos).toHaveLength(2)
      expect(r.uploadBatchInfos[0]).toEqual({ id: 'B1', name: 'batch1', startTime: 'T1' })
    })
  })

  describe('getAllExecutedTasks', () => {
    it('parsea el formato nuevo con atributos en runId', () => {
      const xml = `
        <runId jobId="J1" startDate="20260101" statusCode="TASK:SUCCESS" taskName="T1">100</runId>
        <runId jobId="J2" startDate="20260102" statusCode="TASK:ERROR" taskName="T2">200</runId>`
      const rows = parseResponse('getAllExecutedTasks2', xml)
      expect(rows).toEqual([
        { runId: '100', jobId: 'J1', startDate: '20260101', statusCode: 'SUCCESS', taskName: 'T1' },
        { runId: '200', jobId: 'J2', startDate: '20260102', statusCode: 'ERROR',   taskName: 'T2' },
      ])
    })

    it('cae al formato legacy con elementos return', () => {
      const xml = '<return jobId="J1" startDate="20260101" statusCode="TASK:SUCCESS" taskName="T1">100</return>'
      expect(parseResponse('getAllExecutedTasks', xml)).toEqual([
        { runId: '100', jobId: 'J1', startDate: '20260101', statusCode: 'SUCCESS', taskName: 'T1' },
      ])
    })

    it('devuelve lista vacía cuando no hay ejecuciones', () => {
      expect(parseResponse('getAllExecutedTasks2', '<Envelope><Body/></Envelope>')).toEqual([])
    })
  })

  describe('getTaskLogs', () => {
    const b64 = s => Buffer.from(s, 'utf-8').toString('base64')

    it('devuelve null para los bloques de log ausentes', () => {
      const r = parseResponse('getTaskLogs', '<traceLog><maxPage>1</maxPage></traceLog>')
      expect(r.monitorLog).toBeNull()
      expect(r.errorLog).toBeNull()
      expect(r.traceLog).toMatchObject({ maxPage: '1' })
    })

    it('mapea maxPage, pageNum y JobRunStatus', () => {
      const xml = `<traceLog>
        <maxPage>3</maxPage><pageNum>2</pageNum><JobRunStatus>SUCCESS</JobRunStatus>
      </traceLog>`
      expect(parseResponse('getTaskLogs', xml).traceLog)
        .toMatchObject({ maxPage: '3', pageNum: '2', jobRunStatus: 'SUCCESS' })
    })

    it('decodifica una línea base64', () => {
      const xml = `<traceLog><messageLines>${b64('Hola mundo')}</messageLines></traceLog>`
      expect(parseResponse('getTaskLogs', xml).traceLog.messageLines).toEqual(['Hola mundo'])
    })

    // Cada línea se codifica por separado; concatenarlas antes de decodificar dejaría
    // el padding '=' en medio y rompería el sniff de base64.
    it('decodifica token por token cuando un messageLines empaqueta varias líneas', () => {
      const packed = `${b64('primera')}\n${b64('segunda')}\n${b64('tercera')}`
      const xml = `<traceLog><messageLines>${packed}</messageLines></traceLog>`
      expect(parseResponse('getTaskLogs', xml).traceLog.messageLines)
        .toEqual(['primera\nsegunda\ntercera'])
    })

    it('deja pasar texto plano que no es base64 válido', () => {
      const xml = '<errorLog><messageLines>error: falló el job</messageLines></errorLog>'
      expect(parseResponse('getTaskLogs', xml).errorLog.messageLines).toEqual(['error: falló el job'])
    })

    it('mezcla líneas base64 y texto plano en el mismo bloque', () => {
      const xml = `<traceLog><messageLines>${b64('codificada')}\ntexto plano aquí</messageLines></traceLog>`
      expect(parseResponse('getTaskLogs', xml).traceLog.messageLines)
        .toEqual(['codificada\ntexto plano aquí'])
    })

    it('quita los envoltorios CDATA', () => {
      const xml = `<monitorLog><messageLines><![CDATA[${b64('dentro de cdata')}]]></messageLines></monitorLog>`
      expect(parseResponse('getTaskLogs', xml).monitorLog.messageLines).toEqual(['dentro de cdata'])
    })

    it('mapea varios messageLines a entradas separadas', () => {
      const xml = `<traceLog>
        <messageLines>${b64('linea1')}</messageLines>
        <messageLines>${b64('linea2')}</messageLines>
      </traceLog>`
      expect(parseResponse('getTaskLogs', xml).traceLog.messageLines).toEqual(['linea1', 'linea2'])
    })
  })

  it('cancelTask acepta ambas capitalizaciones', () => {
    expect(parseResponse('cancelTask', '<status>OK</status><message>cancelada</message>'))
      .toEqual({ status: 'OK', message: 'cancelada' })
    expect(parseResponse('cancelTask', '<Status>OK</Status><Message>cancelada</Message>'))
      .toEqual({ status: 'OK', message: 'cancelada' })
  })
})
