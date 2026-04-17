declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | number[];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: any;
    jsPDF?: any;
    pagebreak?: {
      mode?: string | string[];
      before?: string;
      after?: string;
      avoid?: string;
    };
  }

  interface Html2Pdf {
    set(opt: Html2PdfOptions): Html2Pdf;
    from(element: HTMLElement | string): Html2Pdf;
    save(): Promise<void>;
    output(type: string): Promise<any>;
  }

  function html2pdf(): Html2Pdf;
  function html2pdf(element: HTMLElement, opt?: Html2PdfOptions): Html2Pdf;

  export default html2pdf;
}
